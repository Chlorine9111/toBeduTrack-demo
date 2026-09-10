import type { RubricData } from "@/lib/pdf/types";
import type { PdfPageSize } from "@/lib/pdf/pdf-service";
import { compileTypstPdf } from "@/lib/typst/compiler";
import {
  TypstAssetStore,
  cleanText,
  renderBulletListToTypst,
  renderMarkdownContentToTypst,
  resolveTypstPaper,
  toTypstString,
} from "@/lib/typst/render-shared";

export type TypstRubricTemplateVariant = "table" | "cards";

async function renderRubricPartTable(part: RubricData["parts"][number], assetStore: TypstAssetStore) {
  const rows: string[] = [];
  rows.push(
    `#rubric-row(label: ${toTypstString(part.label)}, points: ${toTypstString(`${part.points} 分`)})[
${await renderMarkdownContentToTypst(part.description, assetStore)}
]`,
  );

  for (const criterion of part.criteria) {
    rows.push(
      `#rubric-row(label: ${toTypstString("•")}, points: ${toTypstString(`${criterion.points} 分`)})[
${await renderMarkdownContentToTypst(criterion.text, assetStore)}
]`,
    );
  }

  return rows.join("\n#v(5pt)\n");
}

async function renderRubricPartCard(part: RubricData["parts"][number], assetStore: TypstAssetStore) {
  const criteria = await renderBulletListToTypst(
    part.criteria.map((criterion) => `${criterion.points} 分：${criterion.text}`),
    assetStore,
  );

  return `#block(width: 100%, inset: 12pt, radius: 8pt, fill: rgb("#f8fafc"), stroke: rgb("#d1d5db"))[
#text(weight: "bold")[#(${toTypstString(`${part.label} · ${part.points} 分`)})]
#v(6pt)
${await renderMarkdownContentToTypst(part.description, assetStore)}
#v(8pt)
#text(size: 9pt, fill: rgb("#6b7280"))[#(${toTypstString("评分标准")})]
#v(4pt)
${criteria}
]`;
}

async function buildRubricDocument(
  data: RubricData,
  options: { pageSize: PdfPageSize; templateVariant: TypstRubricTemplateVariant },
  assetStore: TypstAssetStore,
) {
  const theme = options.templateVariant === "cards" ? "friendly" : "academic";
  const bodyParts: string[] = [];

  bodyParts.push(
    options.templateVariant === "cards"
      ? `#section-banner(${toTypstString("评分维度")}, subtitle: ${toTypstString(
          `总分 ${data.totalPoints} 分`,
        )}, theme: ${toTypstString("friendly")})`
      : `#block(width: 100%, inset: 10pt, radius: 0pt, fill: white, stroke: rgb("#111827"))[
#text(size: 12pt, weight: "bold", fill: rgb("#111827"))[#(${toTypstString("评分维度")})]
#v(4pt)
#text(size: 9pt, fill: rgb("#525252"))[#(${toTypstString(`总分 ${data.totalPoints} 分`)})]
]`,
  );
  bodyParts.push("#v(10pt)");

  if (options.templateVariant === "cards") {
    for (const part of data.parts) {
      bodyParts.push(await renderRubricPartCard(part, assetStore));
      bodyParts.push("#v(8pt)");
    }
    if (bodyParts[bodyParts.length - 1] === "#v(8pt)") {
      bodyParts.pop();
    }
  } else {
    bodyParts.push(
      `#rubric-table(title: ${toTypstString(`${data.title}（${data.totalPoints} 分）`)})[`,
    );
    for (const part of data.parts) {
      bodyParts.push(await renderRubricPartTable(part, assetStore));
      bodyParts.push("#v(6pt)");
    }
    if (bodyParts[bodyParts.length - 1] === "#v(6pt)") {
      bodyParts.pop();
    }
    bodyParts.push("]");
  }

  if (Array.isArray(data.notes) && data.notes.length > 0) {
    bodyParts.push("#v(10pt)");
    bodyParts.push(
      options.templateVariant === "cards"
        ? `#section-banner(${toTypstString("评分提示")}, subtitle: ${toTypstString(
            "供教师在实际评分时参考",
          )}, theme: ${toTypstString("friendly")})`
        : `#block(width: 100%, inset: 10pt, radius: 0pt, fill: white, stroke: rgb("#111827"))[
#text(size: 12pt, weight: "bold", fill: rgb("#111827"))[#(${toTypstString("评分提示")})]
#v(4pt)
#text(size: 9pt, fill: rgb("#525252"))[#(${toTypstString("供教师在实际评分时参考")})]
]`,
    );
    bodyParts.push("#v(8pt)");
    bodyParts.push(await renderBulletListToTypst(data.notes, assetStore));
  }

  return [
    `#import "/base.typ": setup-document`,
    `#import "/components/section-banner.typ": section-banner`,
    `#import "/components/rubric-table.typ": rubric-row, rubric-table`,
    "",
    `#setup-document(title: ${toTypstString(data.title)}, paper: ${toTypstString(
      resolveTypstPaper(options.pageSize),
    )}, theme: ${toTypstString(theme)})`,
    `#block(width: 100%, inset: 16pt, radius: ${theme === "friendly" ? "12pt" : "0pt"}, fill: rgb("${
      theme === "friendly" ? "#ecfdf5" : "#ffffff"
    }"), stroke: rgb("${theme === "friendly" ? "#15803d" : "#111827"}"))[`,
    `#text(size: 18pt, weight: "bold", fill: rgb("${theme === "friendly" ? "#15803d" : "#111827"}"))[#(${toTypstString(
      data.title,
    )})]`,
    `#v(6pt)`,
    `#text(size: 10pt, fill: rgb("#6b7280"))[#(${toTypstString(
      [cleanText(data.subtitle), cleanText(data.courseName), cleanText(data.unitTitle)]
        .filter(Boolean)
        .join(" · "),
    )})]`,
    `]`,
    `#v(12pt)`,
    bodyParts.join("\n"),
  ].join("\n");
}

export async function renderRubricTypstPdf(
  data: RubricData,
  options: { pageSize: PdfPageSize; templateVariant: TypstRubricTemplateVariant },
) {
  const assetStore = new TypstAssetStore("rubric-image");
  const mainFileContent = await buildRubricDocument(data, options, assetStore);
  return compileTypstPdf({
    mainFileContent,
    assets: assetStore.list(),
  });
}
