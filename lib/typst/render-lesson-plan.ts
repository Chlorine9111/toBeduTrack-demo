import type { LessonPlanSection } from "@/lib/lesson-plan/types";
import type { LessonPlanPdfInput } from "@/lib/pdf/templates/lesson-plan-template";
import type { PdfPageSize } from "@/lib/pdf/pdf-service";
import { compileTypstPdf } from "@/lib/typst/compiler";
import {
  TypstAssetStore,
  cleanText,
  getRecordString,
  getRecordStringArray,
  renderBulletListToTypst,
  renderMarkdownContentToTypst,
  resolveTypstPaper,
  toTypstString,
} from "@/lib/typst/render-shared";
import { renderDisplayTypstMath } from "@/lib/typst/math";

export type TypstLessonPlanTemplateVariant = "standard" | "compact";

function resolveTheme(templateVariant: TypstLessonPlanTemplateVariant) {
  return templateVariant === "compact" ? "friendly" : "academic";
}

function toStringArray(value: unknown) {
  if (!Array.isArray(value)) return [] as string[];
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

async function renderTeacherNote(note: string | null | undefined) {
  const text = cleanText(note);
  if (!text) {
    return "";
  }

  return `#block(width: 100%, inset: 8pt, radius: 6pt, fill: rgb("#fffbeb"), stroke: rgb("#f59e0b"))[
#text(size: 9pt, weight: "bold", fill: rgb("#92400e"))[#(${toTypstString("Teacher Note")})]
#v(4pt)
#(${toTypstString(text)})
]`;
}

function renderCedCodes(codes: string[]) {
  if (codes.length === 0) {
    return "";
  }
  return `#text(size: 8pt, fill: rgb("#6b7280"))[#(${toTypstString(`CED: ${codes.join(", ")}`)})]`;
}

async function renderImageBlock(content: Record<string, unknown>, assetStore: TypstAssetStore) {
  const url = getRecordString(content, "url");
  const alt = cleanText(getRecordString(content, "alt")) || "教学图片";
  const caption = cleanText(getRecordString(content, "caption"));
  if (!url) {
    return `#(${toTypstString("（图片缺失）")})`;
  }

  try {
    const assetPath = await assetStore.ensureRemoteImage(url);
    if (!assetPath) {
      return `#(${toTypstString("（图片缺失）")})`;
    }

    return [
      `#align(center)[#image(${toTypstString(assetPath)}, width: 76%)]`,
      alt || caption
        ? `#align(center)[#text(size: 8pt, fill: rgb("#6b7280"))[#(${toTypstString(
            caption || alt,
          )})]]`
        : "",
    ]
      .filter(Boolean)
      .join("\n");
  } catch {
    return `#(${toTypstString(`图片加载失败：${alt}`)})`;
  }
}

async function renderLessonBlock(
  block: LessonPlanSection["blocks"][number],
  options: { mode: NonNullable<LessonPlanPdfInput["mode"]> },
  assetStore: TypstAssetStore,
) {
  const content =
    block.content && typeof block.content === "object" && !Array.isArray(block.content)
      ? (block.content as Record<string, unknown>)
      : {};
  const lines: string[] = [];
  const teacherNote =
    options.mode === "teacher" ? await renderTeacherNote(block.teacherNote) : "";
  const cedCodes = renderCedCodes(block.cedCodes);

  if (block.type === "heading") {
    lines.push(
      `#text(size: 13pt, weight: "bold")[#(${toTypstString(getRecordString(content, "text") || "标题")})]`,
    );
  } else if (block.type === "paragraph") {
    lines.push(await renderMarkdownContentToTypst(getRecordString(content, "text"), assetStore));
  } else if (block.type === "math") {
    const latex = getRecordString(content, "latex") || "x";
    lines.push(
      `#block(width: 100%, inset: 10pt, radius: 8pt, fill: rgb("#fcfcfd"), stroke: rgb("#d1d5db"))[
#align(center)[
${renderDisplayTypstMath(latex)}
]
]`,
    );
  } else if (block.type === "image") {
    lines.push(await renderImageBlock(content, assetStore));
  } else if (block.type === "callout") {
    lines.push(
      `#block(width: 100%, inset: 10pt, radius: 8pt, fill: rgb("#eff6ff"), stroke: rgb("#60a5fa"))[
#text(weight: "bold")[#(${toTypstString(getRecordString(content, "title") || "提示")})]
#v(4pt)
${await renderMarkdownContentToTypst(getRecordString(content, "text"), assetStore)}
]`,
    );
  } else if (block.type === "divider") {
    lines.push(`#line(length: 100%, stroke: rgb("#d1d5db"))`);
  } else if (block.type === "definition") {
    lines.push(
      `#block(width: 100%, inset: 10pt, radius: 8pt, fill: rgb("#f8fafc"), stroke: rgb("#d1d5db"))[
#text(weight: "bold")[#(${toTypstString(getRecordString(content, "term") || "概念")})]
#v(4pt)
${await renderMarkdownContentToTypst(getRecordString(content, "explanation"), assetStore)}
]`,
    );
  } else if (block.type === "example") {
    lines.push(
      `#text(weight: "bold")[#(${toTypstString(getRecordString(content, "prompt") || "示例")})]`,
    );
    lines.push("#v(4pt)");
    lines.push(await renderBulletListToTypst(getRecordStringArray(content, "steps"), assetStore));
  } else if (block.type === "steps") {
    lines.push(
      `#text(weight: "bold")[#(${toTypstString(getRecordString(content, "title") || "步骤")})]`,
    );
    lines.push("#v(4pt)");
    lines.push(await renderBulletListToTypst(getRecordStringArray(content, "items"), assetStore));
  } else if (block.type === "quiz") {
    lines.push(
      `#text(weight: "bold")[#(${toTypstString(getRecordString(content, "question") || "小测")})]`,
    );
    lines.push("#v(4pt)");
    const optionObjects = Array.isArray(content.options)
      ? (content.options as Array<{ id?: string; text?: string }>)
      : [];
    lines.push(
      await renderBulletListToTypst(
        optionObjects.map((option) => `${option.id ?? ""}. ${option.text ?? ""}`.trim()),
        assetStore,
      ),
    );
    if (options.mode === "teacher") {
      const correctOptionId = cleanText(getRecordString(content, "correctOptionId"));
      const explanation = cleanText(getRecordString(content, "explanation"));
      if (correctOptionId || explanation) {
        lines.push("#v(6pt)");
        lines.push(
          `#text(size: 9pt, fill: rgb("#6b7280"))[#(${toTypstString(
            [correctOptionId ? `答案：${correctOptionId}` : "", explanation ? `解析：${explanation}` : ""]
              .filter(Boolean)
              .join(" · "),
          )})]`,
        );
      }
    }
  } else if (block.type === "poll") {
    lines.push(
      `#text(weight: "bold")[#(${toTypstString(getRecordString(content, "question") || "讨论题")})]`,
    );
    lines.push("#v(4pt)");
    const optionObjects = Array.isArray(content.options)
      ? (content.options as Array<{ id?: string; text?: string }>)
      : [];
    lines.push(
      await renderBulletListToTypst(
        optionObjects.map((option) => `${option.id ?? ""}. ${option.text ?? ""}`.trim()),
        assetStore,
      ),
    );
  }

  if (cedCodes) {
    lines.push("#v(4pt)");
    lines.push(cedCodes);
  }
  if (teacherNote) {
    lines.push("#v(6pt)");
    lines.push(teacherNote);
  }

  return `#block(width: 100%, inset: 10pt, radius: 8pt, fill: rgb("#ffffff"), stroke: rgb("#d1d5db"))[
${lines.filter(Boolean).join("\n")}
]`;
}

async function renderLessonSection(
  section: LessonPlanSection,
  options: { mode: NonNullable<LessonPlanPdfInput["mode"]>; templateVariant: TypstLessonPlanTemplateVariant },
  assetStore: TypstAssetStore,
) {
  const blocks: string[] = [];
  for (const block of section.blocks.slice().sort((left, right) => left.sortOrder - right.sortOrder)) {
    blocks.push(await renderLessonBlock(block, options, assetStore));
    blocks.push("#v(8pt)");
  }
  if (blocks[blocks.length - 1] === "#v(8pt)") {
    blocks.pop();
  }

  return `#block(width: 100%, breakable: true, inset: 12pt, radius: 10pt, fill: rgb("#f8fafc"), stroke: rgb("#d1d5db"))[
#table(
  columns: (1fr, auto),
  stroke: none,
  [
    #text(size: 13pt, weight: "bold")[#(${toTypstString(section.title)})]
  ],
  [
    #box(inset: (x: 6pt, y: 2pt), radius: 999pt, fill: rgb("#eff6ff"))[
      #text(size: 9pt)[#(${toTypstString(`${section.durationMinutes} 分钟`)})]
    ]
  ],
)
#v(4pt)
#text(size: 9pt, fill: rgb("#6b7280"))[#(${toTypstString(section.summary || "本节概览")})]
#v(10pt)
${blocks.join("\n")}
]`;
}

async function buildLessonPlanDocument(
  data: LessonPlanPdfInput,
  options: {
    pageSize: PdfPageSize;
    templateVariant: TypstLessonPlanTemplateVariant;
    mode: NonNullable<LessonPlanPdfInput["mode"]>;
  },
  assetStore: TypstAssetStore,
) {
  const theme = resolveTheme(options.templateVariant);
  const metaLine = [
    cleanText(data.level),
    typeof data.totalMinutes === "number" ? `${data.totalMinutes} 分钟` : "",
    `${data.sections.length} 个课时段`,
    `模式：${options.mode}`,
  ]
    .filter(Boolean)
    .join(" · ");

  const bodyParts: string[] = [];
  if (data.sections.length >= 5) {
    bodyParts.push(
      `#section-banner(${toTypstString("目录")}, subtitle: ${toTypstString(
        "按教学顺序浏览各段内容",
      )}, theme: ${toTypstString(resolveTheme(options.templateVariant))})`,
    );
    bodyParts.push("#v(8pt)");
    const tocRows = data.sections
      .slice()
      .sort((left, right) => left.sortOrder - right.sortOrder)
      .map(
        (section, index) =>
          `[#(${toTypstString(`${index + 1}.`)})], [#(${toTypstString(section.title)})], [#(${toTypstString(`${section.durationMinutes} 分钟`)})]`,
      );
    bodyParts.push(
      `#table(columns: (auto, 1fr, auto), stroke: none, column-gutter: 10pt, row-gutter: 6pt,\n${tocRows.join(",\n")}\n)`,
    );
    bodyParts.push("#pagebreak()");
  }

  for (const [index, section] of data.sections
    .slice()
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .entries()) {
    if (index > 0) {
      bodyParts.push("#pagebreak()");
    }
    bodyParts.push(
      `#section-banner(${toTypstString(`Section ${index + 1}`)}, subtitle: ${toTypstString(
        section.title,
      )}, theme: ${toTypstString(resolveTheme(options.templateVariant))})`,
    );
    bodyParts.push("#v(10pt)");
    bodyParts.push(await renderLessonSection(section, options, assetStore));
  }

  return [
    `#import "/base.typ": setup-document`,
    `#import "/components/section-banner.typ": section-banner`,
    "",
    `#setup-document(title: ${toTypstString(data.title)}, paper: ${toTypstString(
      resolveTypstPaper(options.pageSize),
    )}, theme: ${toTypstString(theme)})`,
    `#block(width: 100%, inset: 18pt, radius: 12pt, fill: rgb("${
      theme === "friendly" ? "#ecfdf5" : "#eff6ff"
    }"), stroke: rgb("${theme === "friendly" ? "#15803d" : "#1d4ed8"}"))[`,
    `#text(size: 18pt, weight: "bold", fill: rgb("${theme === "friendly" ? "#15803d" : "#1d4ed8"}"))[#(${toTypstString(
      data.title,
    )})]`,
    `#v(6pt)`,
    `#text(size: 10pt, fill: rgb("#6b7280"))[#(${toTypstString(
      [cleanText(data.courseName), cleanText(data.unitName), metaLine].filter(Boolean).join(" · "),
    )})]`,
    `]`,
    `#v(12pt)`,
    bodyParts.join("\n"),
  ].join("\n");
}

export async function renderLessonPlanTypstPdf(
  data: LessonPlanPdfInput,
  options: {
    pageSize: PdfPageSize;
    templateVariant: TypstLessonPlanTemplateVariant;
    mode: NonNullable<LessonPlanPdfInput["mode"]>;
  },
) {
  const assetStore = new TypstAssetStore("lesson-plan-image");
  const mainFileContent = await buildLessonPlanDocument(data, options, assetStore);
  return compileTypstPdf({
    mainFileContent,
    assets: assetStore.list(),
  });
}
