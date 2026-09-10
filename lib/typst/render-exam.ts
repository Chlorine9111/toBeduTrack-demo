import type {
  ExamData,
  ExamSection,
  FRQPart,
  FRQQuestion,
  MCQuestion,
  Question,
} from "@/lib/pdf/types";
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

export type TypstExamTemplateVariant = "classic" | "modern";

// MC 选项文字长度阈值：>= 36 字符或包含数学公式时使用单列
const MC_SHORT_OPTION_THRESHOLD = 36;

function resolveExamTheme(templateVariant: TypstExamTemplateVariant) {
  return templateVariant === "modern" ? "friendly" : "academic";
}

function resolveQuestionMeta(question: MCQuestion | FRQQuestion) {
  const learningObjective = question.type === "MC" ? cleanText(question.lo) : "";
  return [
    cleanText(question.difficultyLabel),
    cleanText(question.meta),
    learningObjective,
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * 判断 MC 选项是否适合两列排列
 * 任何选项文字长度 >= 36 字符或包含数学公式（$）时使用单列
 */
function shouldUseTwoColumns(options: MCQuestion["options"]) {
  if (!options || options.length === 0) return false;
  return options.every(
    (option) =>
      cleanText(option.text).length < MC_SHORT_OPTION_THRESHOLD &&
      !option.text.includes("$"),
  );
}

async function renderExamOptions(question: MCQuestion, assetStore: TypstAssetStore) {
  const useTwoColumns = shouldUseTwoColumns(question.options);

  if (useTwoColumns) {
    // 两列 grid 布局
    const optionBlocks: string[] = [];
    for (const option of question.options) {
      optionBlocks.push(
        `block(width: 100%, inset: 8pt, radius: 6pt, fill: rgb("#f8fafc"), stroke: rgb("#d1d5db"))[
#table(
  columns: (auto, 1fr),
  stroke: none,
  column-gutter: 10pt,
  [#box(inset: (x: 6pt, y: 2pt), radius: 999pt, fill: rgb("#eff6ff"))[
    #text(weight: "bold")[#(${toTypstString(option.label)})]
  ]],
  [
${await renderMarkdownContentToTypst(option.text, assetStore)}
  ],
)
]`,
      );
    }
    return `#grid(
  columns: (1fr, 1fr),
  column-gutter: 8pt,
  row-gutter: 6pt,
  ${optionBlocks.join(",\n  ")}
)`;
  }

  // 单列排列
  const rows: string[] = [];
  for (const option of question.options) {
    rows.push(
      `#block(width: 100%, inset: 8pt, radius: 6pt, fill: rgb("#f8fafc"), stroke: rgb("#d1d5db"))[
#table(
  columns: (auto, 1fr),
  stroke: none,
  column-gutter: 10pt,
  [#box(inset: (x: 6pt, y: 2pt), radius: 999pt, fill: rgb("#eff6ff"))[
    #text(weight: "bold")[#(${toTypstString(option.label)})]
  ]],
  [
${await renderMarkdownContentToTypst(option.text, assetStore)}
  ],
)
]`,
    );
  }
  return rows.join("\n#v(6pt)\n");
}

async function renderMcQuestion(question: MCQuestion, assetStore: TypstAssetStore) {
  const meta = resolveQuestionMeta(question);
  // MC 题目默认 breakable: false，超长题目除外
  const breakable = cleanText(question.stem).length > 1100;
  return `#block(width: 100%, breakable: ${breakable ? "true" : "false"}, inset: 12pt, radius: 8pt, stroke: rgb("#d1d5db"))[
#text(weight: "bold")[#(${toTypstString(`${question.number}. 选择题`)})]
#if ${toTypstString(meta)} != "" [
  #h(8pt)
  #text(size: 9pt, fill: rgb("#6b7280"))[#(${toTypstString(meta)})]
]
#v(8pt)
${await renderMarkdownContentToTypst(question.stem, assetStore)}
#v(10pt)
${await renderExamOptions(question, assetStore)}
]`;
}

async function renderFrqQuestion(question: FRQQuestion, assetStore: TypstAssetStore) {
  const meta = resolveQuestionMeta(question);
  const parts: string[] = [];

  if (question.parts.length > 0) {
    for (const part of question.parts) {
      // FRQ 子题使用 1fr 自适应填充剩余空间
      parts.push(
        `#block(width: 100%, inset: 8pt, radius: 6pt, fill: rgb("#f8fafc"), stroke: rgb("#d1d5db"))[
#text(weight: "bold")[#(${toTypstString(`${part.label}（${part.points} 分）`)})]
#v(6pt)
${await renderMarkdownContentToTypst(part.prompt, assetStore)}
#v(8pt)
#v(1fr)
]`,
      );
    }
  } else {
    // 无子题时也使用 1fr
    parts.push(`#v(1fr)`);
  }

  // FRQ 题目默认允许跨页（通常较长）
  return `#block(width: 100%, breakable: true, inset: 12pt, radius: 8pt, stroke: rgb("#d1d5db"))[
#text(weight: "bold")[#(${toTypstString(`${question.number}. 简答题`)})]
#if ${toTypstString(meta)} != "" [
  #h(8pt)
  #text(size: 9pt, fill: rgb("#6b7280"))[#(${toTypstString(meta)})]
]
#v(8pt)
${await renderMarkdownContentToTypst(question.stem, assetStore)}
#v(10pt)
${parts.join("\n#v(8pt)\n")}
]`;
}

async function renderSection(section: ExamSection, assetStore: TypstAssetStore) {
  const renderedQuestions: string[] = [];
  for (const question of section.questions) {
    renderedQuestions.push(
      question.type === "MC"
        ? await renderMcQuestion(question, assetStore)
        : await renderFrqQuestion(question, assetStore),
    );
    renderedQuestions.push("#v(10pt)");
  }
  if (renderedQuestions[renderedQuestions.length - 1] === "#v(10pt)") {
    renderedQuestions.pop();
  }

  return [
    `#section-banner(${toTypstString(section.title)}, subtitle: ${toTypstString(
      cleanText(section.directions),
    )}, theme: ${toTypstString("academic")})`,
    "#v(10pt)",
    renderedQuestions.join("\n"),
  ].join("\n");
}

function buildRubricParts(question: FRQQuestion) {
  if (question.parts.length > 0) {
    return question.parts.map((part) => ({
      label: part.label,
      points: part.points,
      description: part.prompt,
      criteria:
        part.rubricCriteria && part.rubricCriteria.length > 0
          ? part.rubricCriteria
          : cleanText(part.solution)
            ? cleanText(part.solution)
                .split(/[;\n]/)
                .map((item) => item.trim())
                .filter(Boolean)
            : [part.prompt],
    }));
  }

  return [
    {
      label: `${question.number}`,
      points: 5,
      description: question.stem,
      criteria: [cleanText(question.solution) || question.stem],
    },
  ];
}

async function renderAnswerKey(data: ExamData, assetStore: TypstAssetStore) {
  const mcRows: string[] = [];
  const frqRows: string[] = [];

  for (const section of data.sections) {
    for (const question of section.questions) {
      if (question.type === "MC") {
        mcRows.push(
          `[#(${toTypstString(`${question.number}.`)})], [#(${toTypstString(question.answer || "-")})]`,
        );
        continue;
      }

      frqRows.push(
        `#block(width: 100%, inset: 10pt, radius: 8pt, fill: rgb("#f8fafc"), stroke: rgb("#d1d5db"))[
#text(weight: "bold")[#(${toTypstString(`${question.number}. 简答题答案`)})]
#v(6pt)
${await renderMarkdownContentToTypst(question.solution || "请教师补充答案。", assetStore)}
]`,
      );
    }
  }

  const parts: string[] = [
    `#section-banner(${toTypstString("Answer Key")}, subtitle: ${toTypstString(
      "仅供教师参考",
    )}, theme: ${toTypstString(resolveExamTheme("modern"))})`,
    "#v(10pt)",
  ];

  if (mcRows.length > 0) {
    parts.push(
      `#table(columns: 2, stroke: rgb("#d1d5db"), inset: 6pt, column-gutter: 16pt, row-gutter: 6pt,\n${mcRows.join(",\n")}\n)`,
    );
  }

  if (frqRows.length > 0) {
    if (mcRows.length > 0) {
      parts.push("#v(12pt)");
    }
    parts.push(frqRows.join("\n#v(8pt)\n"));
  }

  return parts.join("\n");
}

async function renderRubricPage(data: ExamData, assetStore: TypstAssetStore) {
  const rows: string[] = [
    `#section-banner(${toTypstString("Rubric")}, subtitle: ${toTypstString(
      "FRQ 评分参考",
    )}, theme: ${toTypstString(resolveExamTheme("modern"))})`,
    "#v(10pt)",
  ];

  for (const question of data.sections.flatMap((section) => section.questions)) {
    if (question.type !== "FRQ") continue;
    const rubricParts = buildRubricParts(question);
    rows.push(
      `#rubric-table(title: ${toTypstString(`第 ${question.number} 题（${rubricParts.reduce((sum, part) => sum + part.points, 0)} 分）`)})[`,
    );
    for (const part of rubricParts) {
      rows.push(
        `#rubric-row(label: ${toTypstString(part.label)}, points: ${toTypstString(`${part.points} 分`)})[
${await renderMarkdownContentToTypst(part.description, assetStore)}
]`,
      );
      rows.push(
        await renderBulletListToTypst(
          part.criteria.map((criterion) => `${criterion}`),
          assetStore,
        ),
      );
      rows.push("#v(6pt)");
    }
    if (rows[rows.length - 1] === "#v(6pt)") {
      rows.pop();
    }
    rows.push("]");
    rows.push("#v(10pt)");
  }

  if (rows[rows.length - 1] === "#v(10pt)") {
    rows.pop();
  }

  return rows.join("\n");
}

async function buildExamDocument(
  data: ExamData,
  options: { pageSize: PdfPageSize; templateVariant: TypstExamTemplateVariant },
  assetStore: TypstAssetStore,
) {
  const theme = resolveExamTheme(options.templateVariant);
  const sections: string[] = [];

  for (const [index, section] of data.sections.entries()) {
    if (index > 0) {
      sections.push("#pagebreak()");
    }
    sections.push(await renderSection(section, assetStore));
  }

  // 答案页单独起新页
  if (data.includeAnswerKey) {
    sections.push("#pagebreak()");
    sections.push(await renderAnswerKey(data, assetStore));
  }

  // 评分标准单独起新页
  if (data.includeRubric) {
    sections.push("#pagebreak()");
    sections.push(await renderRubricPage(data, assetStore));
  }

  return [
    `#import "/base.typ": setup-document`,
    `#import "/components/student-info.typ": student-info`,
    `#import "/components/section-banner.typ": section-banner`,
    `#import "/components/rubric-table.typ": rubric-row, rubric-table`,
    "",
    `#setup-document(title: ${toTypstString(data.title)}, paper: ${toTypstString(
      resolveTypstPaper(options.pageSize),
    )}, theme: ${toTypstString(theme)})`,
    `#block(width: 100%, inset: 16pt, radius: 12pt, fill: rgb("${
      theme === "friendly" ? "#ecfdf5" : "#eff6ff"
    }"), stroke: rgb("${theme === "friendly" ? "#15803d" : "#1d4ed8"}"))[`,
    `#text(size: 18pt, weight: "bold", fill: rgb("${theme === "friendly" ? "#15803d" : "#1d4ed8"}"))[#(${toTypstString(
      data.title,
    )})]`,
    `#v(6pt)`,
    `#text(size: 10pt, fill: rgb("#6b7280"))[#(${toTypstString(
      [cleanText(data.course), cleanText(data.subtitle)].filter(Boolean).join(" · "),
    )})]`,
    `]`,
    `#v(10pt)`,
    `#student-info(date: ${toTypstString("")})`,
    `#v(12pt)`,
    sections.join("\n"),
  ].join("\n");
}

export async function renderExamTypstPdf(
  data: ExamData,
  options: { pageSize: PdfPageSize; templateVariant: TypstExamTemplateVariant },
) {
  const assetStore = new TypstAssetStore("exam-image");
  const mainFileContent = await buildExamDocument(data, options, assetStore);
  return compileTypstPdf({
    mainFileContent,
    assets: assetStore.list(),
  });
}
