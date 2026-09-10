import type { LessonPlanSection, LessonPlanBlock } from "@/lib/lesson-plan/types";
import type { LessonPlanPdfInput } from "@/lib/pdf/templates/lesson-plan-template";

type BuildLessonPlanPdfInputParams = {
  html: string;
  title?: string | null;
  pageSize?: "A4" | "Letter";
};

function cleanText(value: string | null | undefined) {
  return `${value ?? ""}`.replace(/\s+/g, " ").trim();
}

function slugId(value: string, fallback: string) {
  const normalized = value
    .toLowerCase()
    .replace(/[\s/]+/g, "-")
    .replace(/[^a-z0-9-\u4e00-\u9fa5]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return normalized || fallback;
}

function nodeToMarkdownish(node: ChildNode): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent ?? "";
  }

  if (!(node instanceof HTMLElement)) {
    return "";
  }

  const tag = node.tagName.toLowerCase();
  if (tag === "br") return "\n";
  if (tag === "math-inline") {
    const latex = node.getAttribute("data-latex")?.trim() ?? "";
    return latex ? `$${latex}$` : "";
  }
  if (tag === "math-display") {
    const latex = node.getAttribute("data-latex")?.trim() ?? "";
    return latex ? `\n$$${latex}$$\n` : "";
  }
  if (tag === "img") {
    const src = node.getAttribute("src")?.trim() ?? "";
    const alt = node.getAttribute("alt")?.trim() ?? "附图";
    return src ? `![${alt}](${src})` : "";
  }

  const inner = Array.from(node.childNodes).map(nodeToMarkdownish).join("");

  if (tag === "strong" || tag === "b") return `**${inner}**`;
  if (tag === "em" || tag === "i") return `*${inner}*`;
  if (tag === "code") return `\`${inner}\``;
  if (tag === "p") return inner.trim();
  if (tag === "li") return inner.trim();
  if (tag === "blockquote") return inner
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");

  return inner;
}

function elementToMarkdownish(element: HTMLElement) {
  return Array.from(element.childNodes)
    .map(nodeToMarkdownish)
    .join("")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function parseDurationFromHeading(heading: string) {
  const match = heading.match(/^(.*?)[（(]\s*(\d+)\s*(?:min|mins|minute|minutes|分钟)\s*[)）]\s*$/i);
  if (!match) {
    return {
      title: heading.trim(),
      duration: null as number | null,
    };
  }

  return {
    title: match[1]?.trim() || heading.trim(),
    duration: Number.parseInt(match[2] ?? "", 10) || null,
  };
}

function parseHeaderMeta(article: HTMLElement, explicitTitle?: string | null) {
  const headerSection = article.querySelector('section[data-section="header"]');
  const headingText = cleanText(headerSection?.querySelector("h1")?.textContent);
  const title = cleanText(explicitTitle) || headingText || "Lesson Plan";
  const metaLine = cleanText(
    Array.from(headerSection?.querySelectorAll("p") ?? [])
      .map((item) => item.textContent ?? "")
      .find((item) => item.includes("·")) ?? "",
  );

  const parts = metaLine
    .split("·")
    .map((item) => cleanText(item))
    .filter(Boolean);
  const durationPart = parts.find((item) => /\d+\s*分钟/i.test(item));
  const totalMinutes = durationPart
    ? Number.parseInt(durationPart.replace(/[^\d]/g, ""), 10) || null
    : null;
  const courseName = parts.find((item) => !/\d+\s*分钟/i.test(item)) ?? null;

  return {
    title,
    courseName,
    totalMinutes,
  };
}

function listItemsToBlock(
  listElement: HTMLElement,
  sectionId: string,
  index: number,
): LessonPlanBlock | null {
  const items = Array.from(listElement.querySelectorAll(":scope > li"))
    .map((item) => elementToMarkdownish(item as HTMLElement))
    .map(cleanText)
    .filter(Boolean);
  if (items.length === 0) return null;

  return {
    id: `${sectionId}-steps-${index + 1}`,
    type: "steps",
    sortOrder: index,
    content: {
      title: listElement.tagName.toLowerCase() === "ol" ? "步骤" : "活动",
      items,
    },
    cedCodes: [],
  };
}

function paragraphToBlock(
  paragraph: HTMLElement,
  sectionId: string,
  index: number,
): LessonPlanBlock | null {
  const text = elementToMarkdownish(paragraph);
  if (!cleanText(text)) return null;
  return {
    id: `${sectionId}-paragraph-${index + 1}`,
    type: "paragraph",
    sortOrder: index,
    content: {
      text,
    },
    cedCodes: [],
  };
}

function blockquoteToBlock(
  blockquote: HTMLElement,
  sectionId: string,
  index: number,
): LessonPlanBlock | null {
  const text = elementToMarkdownish(blockquote);
  if (!cleanText(text)) return null;

  return {
    id: `${sectionId}-callout-${index + 1}`,
    type: "callout",
    sortOrder: index,
    subtype: "think",
    content: {
      title: "提示",
      text,
    },
    cedCodes: [],
  };
}

function imageToBlock(
  image: HTMLElement,
  sectionId: string,
  index: number,
): LessonPlanBlock | null {
  const url = image.getAttribute("src")?.trim() ?? "";
  if (!url) return null;
  return {
    id: `${sectionId}-image-${index + 1}`,
    type: "image",
    sortOrder: index,
    content: {
      url,
      alt: image.getAttribute("alt")?.trim() ?? "",
    },
    cedCodes: [],
  };
}

function mathToBlock(
  math: HTMLElement,
  sectionId: string,
  index: number,
): LessonPlanBlock | null {
  const latex = math.getAttribute("data-latex")?.trim() ?? "";
  if (!latex) return null;
  return {
    id: `${sectionId}-math-${index + 1}`,
    type: "math",
    sortOrder: index,
    content: {
      latex,
      displayMode: true,
    },
    cedCodes: [],
  };
}

function extractSectionSummary(section: HTMLElement) {
  const firstParagraph = Array.from(section.children).find(
    (child) =>
      child.tagName.toLowerCase() === "p" &&
      !cleanText(child.textContent).startsWith("阶段："),
  );
  return firstParagraph ? cleanText(firstParagraph.textContent) : "";
}

function parseLessonSection(section: HTMLElement, index: number): LessonPlanSection | null {
  const sectionId = section.getAttribute("data-section")?.trim() || `section-${index + 1}`;
  const heading = section.querySelector("h2,h3,h4");
  const headingText = cleanText(heading?.textContent);
  if (!headingText) return null;

  const { title, duration } = parseDurationFromHeading(headingText);
  const blocks: LessonPlanBlock[] = [];

  Array.from(section.children).forEach((child, childIndex) => {
    if (!(child instanceof HTMLElement)) return;
    if (child === heading) return;

    const tag = child.tagName.toLowerCase();
    if (tag === "p" && cleanText(child.textContent).startsWith("阶段：")) {
      return;
    }

    const directMathDisplay = child.matches("math-display")
      ? mathToBlock(child, sectionId, childIndex)
      : null;
    if (directMathDisplay) {
      blocks.push(directMathDisplay);
      return;
    }

    if (tag === "p") {
      const block = paragraphToBlock(child, sectionId, childIndex);
      if (block) blocks.push(block);
      return;
    }
    if (tag === "ul" || tag === "ol") {
      const block = listItemsToBlock(child, sectionId, childIndex);
      if (block) blocks.push(block);
      return;
    }
    if (tag === "blockquote") {
      const block = blockquoteToBlock(child, sectionId, childIndex);
      if (block) blocks.push(block);
      return;
    }
    if (tag === "img") {
      const block = imageToBlock(child, sectionId, childIndex);
      if (block) blocks.push(block);
      return;
    }
    if (tag === "hr") {
      blocks.push({
        id: `${sectionId}-divider-${childIndex + 1}`,
        type: "divider",
        sortOrder: childIndex,
        content: {},
        cedCodes: [],
      });
      return;
    }

    const text = elementToMarkdownish(child);
    if (cleanText(text)) {
      blocks.push({
        id: `${sectionId}-paragraph-${childIndex + 1}`,
        type: "paragraph",
        sortOrder: childIndex,
        content: { text },
        cedCodes: [],
      });
    }
  });

  return {
    id: slugId(sectionId, `section-${index + 1}`),
    title: title || `Section ${index + 1}`,
    summary: extractSectionSummary(section),
    durationMinutes: duration ?? 0,
    sortOrder: index,
    blocks,
  };
}

export function buildLessonPlanPdfInputFromHtml(
  params: BuildLessonPlanPdfInputParams,
): LessonPlanPdfInput | null {
  const parser = new DOMParser();
  const doc = parser.parseFromString(params.html, "text/html");
  const article = doc.querySelector("article[data-doc-type='lesson-plan']");
  if (!(article instanceof HTMLElement)) {
    return null;
  }

  const meta = parseHeaderMeta(article, params.title);
  const sections = Array.from(article.querySelectorAll("section[data-section]"))
    .filter((section) => section.getAttribute("data-section") !== "header")
    .map((section, index) => parseLessonSection(section as HTMLElement, index))
    .filter((section): section is LessonPlanSection => Boolean(section));

  if (sections.length === 0) {
    return null;
  }

  const computedMinutes = sections.reduce(
    (sum, section) => sum + (section.durationMinutes || 0),
    0,
  );
  const totalMinutes = meta.totalMinutes ?? (computedMinutes || null);

  return {
    title: meta.title,
    courseName: meta.courseName,
    totalMinutes,
    sections,
    mode: "teacher",
    pageSize: params.pageSize ?? "A4",
  };
}

export async function exportLessonPlanTypstPdf(params: BuildLessonPlanPdfInputParams) {
  const lessonPlan = buildLessonPlanPdfInputFromHtml(params);
  if (!lessonPlan) {
    return null;
  }

  const response = await fetch("/api/doc/export-lesson-typst-pdf", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      lessonPlan,
      title: params.title,
      pageSize: params.pageSize ?? "A4",
      mode: "teacher",
      templateVariant: "standard",
    }),
  });

  if (!response.ok) {
    return null;
  }

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/pdf")) {
    return null;
  }

  return response.blob();
}
