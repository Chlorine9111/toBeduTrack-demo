import type { RubricData } from "@/lib/pdf/types";
import type {
  WorksheetExercise,
  WorksheetRenderInput,
  WorksheetTemplateVariant,
} from "@/lib/pdf/templates/worksheet-template";
import type { PdfPageSize } from "@/lib/pdf/pdf-service";
import { compileTypstPdf } from "@/lib/typst/compiler";
import {
  TypstAssetStore,
  cleanText,
  renderMarkdownContentToTypst,
  resolveTypstPaper,
  toTypstString,
} from "@/lib/typst/render-shared";

// MC 选项文字长度阈值：>= 36 字符或包含数学公式时使用单列
const MC_SHORT_OPTION_THRESHOLD = 36;

/**
 * 将图片 URL（支持 http(s) 和 data URL）转换为 Buffer
 * 失败时返回 null，不抛出异常
 */
async function fetchImageAsBuffer(url: string): Promise<Buffer | null> {
  try {
    if (url.startsWith("data:")) {
      // data URL：data:image/png;base64,xxxxx
      const commaIndex = url.indexOf(",");
      if (commaIndex === -1) return null;
      const base64Data = url.slice(commaIndex + 1);
      return Buffer.from(base64Data, "base64");
    }
    const response = await fetch(url);
    if (!response.ok) return null;
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch {
    return null;
  }
}

function resolvePointsLabel(exercise: WorksheetExercise) {
  return typeof exercise.totalPoints === "number" ? `${exercise.totalPoints} 分` : "未设分值";
}

function isBreakableQuestion(exercise: WorksheetExercise) {
  return cleanText(exercise.questionText).length > 1100;
}

/**
 * 判断 MC 选项是否适合两列排列
 * 任何选项文字长度 >= 36 字符或包含数学公式（$）时使用单列
 */
function shouldUseTwoColumns(exercise: WorksheetExercise) {
  const options = exercise.options ?? [];
  if (options.length === 0) return false;
  return options.every(
    (option) =>
      cleanText(option.text).length < MC_SHORT_OPTION_THRESHOLD &&
      !option.text.includes("$"),
  );
}

async function renderOptionsToTypst(
  exercise: WorksheetExercise,
  assetStore: TypstAssetStore,
) {
  const options = exercise.options ?? [];
  if (options.length === 0) {
    return `#(${toTypstString("（暂无选项）")})`;
  }

  const useTwoColumns = shouldUseTwoColumns(exercise);

  if (useTwoColumns) {
    const optionBlocks: string[] = [];
    for (const option of options) {
      const optionContent = await renderMarkdownContentToTypst(option.text, assetStore);
      optionBlocks.push(
        `[#text(weight: "bold")[#(${toTypstString(option.label)}).] #h(4pt) ${optionContent}]`,
      );
    }
    return `#grid(
  columns: (1fr, 1fr),
  column-gutter: 16pt,
  row-gutter: 6pt,
  ${optionBlocks.join(",\n  ")}
)`;
  }

  const parts: string[] = [];
  for (const option of options) {
    const optionContent = await renderMarkdownContentToTypst(option.text, assetStore);
    parts.push(
      `#text(weight: "bold")[#(${toTypstString(option.label)}).] #h(4pt) ${optionContent}`,
    );
    parts.push("#v(4pt)");
  }
  if (parts[parts.length - 1] === "#v(4pt)") {
    parts.pop();
  }
  return parts.join("\n");
}

/** 笔画数据结构（与前端 DrawingStroke 保持一致） */
type DrawingStrokeData = {
  points: Array<{ x: number; y: number }>;
  color: string;
  lineWidth: number;
};

/**
 * 将画笔笔画数据转换为 SVG 字符串
 * 坐标使用 0-1 相对值，转换为 SVG viewBox 尺寸
 */
function strokesToSvg(
  strokes: DrawingStrokeData[],
  svgWidth: number,
  svgHeight: number,
): string {
  const paths: string[] = [];

  for (const stroke of strokes) {
    if (stroke.points.length < 2) continue;
    // 跳过橡皮擦笔画（PDF 中不支持 destination-out）
    if (stroke.color === "eraser") continue;

    const segments = stroke.points
      .map((point, index) => {
        const x = (point.x * svgWidth).toFixed(2);
        const y = point.y.toFixed(2); // Y 已经是绝对像素值
        return index === 0 ? `M${x},${y}` : `L${x},${y}`;
      })
      .join(" ");

    paths.push(
      `<path d="${segments}" stroke="${stroke.color}" stroke-width="${stroke.lineWidth}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
    );
  }

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgWidth} ${svgHeight}" width="${svgWidth}" height="${svgHeight}">`,
    ...paths,
    `</svg>`,
  ].join("\n");
}

async function renderBlankBlockToTypst(
  exercise: WorksheetExercise,
  assetStore: TypstAssetStore,
) {
  const blankContent = cleanText(exercise.blankContent ?? "");
  const heightMm = exercise.blankHeight ?? 80;

  // 解析绘画数据
  let drawingStrokes: DrawingStrokeData[] = [];
  if (exercise.drawingData) {
    try {
      drawingStrokes = JSON.parse(exercise.drawingData) as DrawingStrokeData[];
    } catch {
      // 解析失败则忽略绘画数据
    }
  }

  const hasDrawing =
    drawingStrokes.length > 0 &&
    drawingStrokes.some((stroke) => stroke.color !== "eraser" && stroke.points.length >= 2);

  // 有绘画数据时，渲染为 SVG 嵌入
  if (hasDrawing) {
    const svgWidth = 760;
    const svgHeight = 400;
    const svgContent = strokesToSvg(drawingStrokes, svgWidth, svgHeight);
    const assetPath = `/assets/drawing-${Date.now()}.svg`;
    assetStore.registerInlineAsset(assetPath, Buffer.from(svgContent));

    const parts: string[] = [];

    // 如果同时有文字内容，先渲染文字
    if (blankContent) {
      const content = await renderMarkdownContentToTypst(blankContent, assetStore);
      parts.push(content);
      parts.push("#v(8pt)");
    }

    // 嵌入绘画 SVG
    parts.push(`#block(width: 100%, breakable: false)[
#image("${assetPath}", width: 100%)
]`);
    parts.push("#v(4pt)");
    parts.push(`#line(length: 100%, stroke: 0.5pt + rgb("#e0e0e0"))`);

    return parts.join("\n");
  }

  if (blankContent) {
    const content = await renderMarkdownContentToTypst(blankContent, assetStore);
    return `#block(width: 100%, breakable: false)[
${content}
]
#v(4pt)
#line(length: 100%, stroke: 0.5pt + rgb("#e0e0e0"))`;
  }

  return `#block(width: 100%, breakable: false)[
#v(${heightMm}mm)
]
#v(4pt)
#line(length: 100%, stroke: 0.5pt + rgb("#e0e0e0"))`;
}

async function renderQuestionToTypst(
  exercise: WorksheetExercise,
  index: number,
  assetStore: TypstAssetStore,
) {
  // 空白块走专用渲染
  if (exercise.isBlankBlock) {
    return renderBlankBlockToTypst(exercise, assetStore);
  }

  const prompt = await renderMarkdownContentToTypst(exercise.questionText, assetStore);
  const points = resolvePointsLabel(exercise);
  const numberLabel = toTypstString(`${index + 1}.`);
  const breakable = isBreakableQuestion(exercise);

  // 如果有 stimulus 图片，在题干前渲染
  let stimulusBlock = "";
  if (exercise.stimulusImageUrl) {
    const scale = Math.max(0.25, Math.min(1.0, exercise.stimulusImageScale ?? 1.0));
    const widthPercent = Math.round(scale * 100);
    const assetPath = `/assets/stimulus-${index}-${Date.now()}.png`;
    const imageBuffer = await fetchImageAsBuffer(exercise.stimulusImageUrl);
    if (imageBuffer) {
      assetStore.registerInlineAsset(assetPath, imageBuffer);
      stimulusBlock = `#image("${assetPath}", width: ${widthPercent}%)\n#v(6pt)\n`;
    }
  }

  if (exercise.type === "MC") {
    const options = await renderOptionsToTypst(exercise, assetStore);
    return `#block(width: 100%, breakable: ${breakable ? "true" : "false"})[
#text(weight: "bold")[#(${numberLabel})] #h(4pt) #text(size: 9pt, fill: rgb("#666666"))[(${points})]
#v(6pt)
${stimulusBlock}${prompt}
#v(8pt)
${options}
]
#v(4pt)
#line(length: 100%, stroke: 0.5pt + rgb("#e0e0e0"))`;
  }

  return `#block(width: 100%, breakable: ${breakable ? "true" : "false"})[
#text(weight: "bold")[#(${numberLabel})] #h(4pt) #text(size: 9pt, fill: rgb("#666666"))[(${points})]
#v(6pt)
${stimulusBlock}${prompt}
#v(16pt)
]
#v(4pt)
#line(length: 100%, stroke: 0.5pt + rgb("#e0e0e0"))`;
}

function resolveExerciseAnswer(exercise: WorksheetExercise) {
  if (cleanText(exercise.correctAnswer)) {
    return cleanText(exercise.correctAnswer);
  }

  if (exercise.type === "MC") {
    const correct = (exercise.options ?? []).find((option) => option.isCorrect);
    return correct?.label ?? cleanText(correct?.text) ?? "-";
  }

  return cleanText(exercise.solutionSteps) || "-";
}

async function renderAnswerKeyToTypst(
  exercise: WorksheetExercise,
  index: number,
  assetStore: TypstAssetStore,
  includeExplanations: boolean,
) {
  const explanation = includeExplanations
    ? await renderMarkdownContentToTypst(exercise.solutionSteps, assetStore)
    : `#(${toTypstString("未附带解析。")})`;
  return `#block(width: 100%)[
#text(weight: "bold")[#(${toTypstString(`${index + 1}.`)})] #h(4pt) #(${toTypstString(resolveExerciseAnswer(exercise))})
${includeExplanations && cleanText(exercise.solutionSteps) ? `#v(4pt)
#text(size: 9pt, fill: rgb("#666666"))[解析：] ${explanation}` : ""}
]
#v(2pt)
#line(length: 100%, stroke: 0.3pt + rgb("#e0e0e0"))`;
}

async function renderRubricToTypst(rubric: RubricData, assetStore: TypstAssetStore) {
  const rows: string[] = [];
  for (const part of rubric.parts) {
    rows.push(
      `#table(
  columns: (auto, auto, 1fr),
  stroke: none,
  column-gutter: 12pt,
  [#text(weight: "bold")[#(${toTypstString(part.label)})]],
  [#(${toTypstString(`${part.points} 分`)})],
  [
${await renderMarkdownContentToTypst(part.description, assetStore)}
  ],
)`,
    );
    for (const criterion of part.criteria) {
      rows.push(
        `#table(
  columns: (auto, auto, 1fr),
  stroke: none,
  column-gutter: 12pt,
  [#(${toTypstString("•")})],
  [#(${toTypstString(`${criterion.points} 分`)})],
  [
${await renderMarkdownContentToTypst(criterion.text, assetStore)}
  ],
)`,
      );
    }
    rows.push("#v(6pt)");
  }
  if (rows[rows.length - 1] === "#v(6pt)") {
    rows.pop();
  }

  return `#block(width: 100%, inset: 12pt, radius: 8pt, fill: rgb("#f8fafc"), stroke: rgb("#d1d5db"))[
#text(weight: "bold")[#(${toTypstString(`${rubric.title}（${rubric.totalPoints} 分）`)})]
#v(8pt)
${rows.join("\n")}
]`;
}

const DESKMATE_WATERMARK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="13" viewBox="0 0 100 13" fill="none">
  <text x="0" y="11" font-family="Palatino, Georgia, serif" font-style="italic" font-size="7" letter-spacing="0.03em" fill="#858481" opacity="0.65">powered by</text>
  <path d="M47 2 L47 12 L36.5 12 Z" stroke="#3B2A22" stroke-width="2" stroke-linejoin="round" fill="none" opacity="0.65"/>
  <text x="49" y="11" font-family="Plus Jakarta Sans, Helvetica, Arial, sans-serif" font-size="9" font-weight="600" letter-spacing="0.02em" fill="#3B2A22" opacity="0.65">eskmate</text>
</svg>`;

async function buildWorksheetDocument(
  data: WorksheetRenderInput,
  options: { pageSize: PdfPageSize; templateVariant: WorksheetTemplateVariant },
  assetStore: TypstAssetStore,
) {
  const theme = options.templateVariant === "friendly" ? "friendly" : "academic";
  const subtitle =
    options.templateVariant === "friendly" ? "Friendly Worksheet" : "Academic Worksheet";

  // 注册水印 SVG 为 Typst 资产
  assetStore.registerInlineAsset("/deskmate-watermark.svg", Buffer.from(DESKMATE_WATERMARK_SVG));

  const bodyParts: string[] = [];
  bodyParts.push(`#v(4pt)`);

  // 题号排序：空白块不占题号
  let questionIndex = 0;
  for (const exercise of data.exercises) {
    // Section 标题
    if (exercise.sectionTitle) {
      bodyParts.push(`#v(6pt)`);
      bodyParts.push(`#text(size: 12pt, weight: "bold")[#(${toTypstString(exercise.sectionTitle)})]`);
      bodyParts.push(`#v(2pt)`);
      bodyParts.push(`#line(length: 100%, stroke: 0.5pt + rgb("#999999"))`);
      bodyParts.push(`#v(6pt)`);
    }

    if (exercise.isBlankBlock) {
      bodyParts.push(await renderQuestionToTypst(exercise, questionIndex, assetStore));
    } else {
      bodyParts.push(await renderQuestionToTypst(exercise, questionIndex, assetStore));
      questionIndex += 1;
    }
    bodyParts.push("#v(10pt)");
  }
  if (bodyParts[bodyParts.length - 1] === "#v(10pt)") {
    bodyParts.pop();
  }

  // 答案页单独起新页（跳过空白块）
  if (data.includeAnswerKey) {
    const answerExercises = data.exercises.filter((exercise) => !exercise.isBlankBlock);
    bodyParts.push("#pagebreak()");
    bodyParts.push(`#text(size: 14pt, weight: "bold")[Answer Key]`);
    bodyParts.push(`#v(2pt)`);
    bodyParts.push(`#line(length: 100%, stroke: 1pt + rgb("#333333"))`);
    bodyParts.push("#v(8pt)");
    for (const [index, exercise] of answerExercises.entries()) {
      bodyParts.push(
        await renderAnswerKeyToTypst(
          exercise,
          index,
          assetStore,
          Boolean(data.includeExplanations),
        ),
      );
      bodyParts.push("#v(8pt)");
    }
    if (bodyParts[bodyParts.length - 1] === "#v(8pt)") {
      bodyParts.pop();
    }
  }

  // 评分标准单独起新页
  if (data.rubrics && data.rubrics.length > 0) {
    bodyParts.push("#pagebreak()");
    bodyParts.push(`#text(size: 14pt, weight: "bold")[Rubric]`);
    bodyParts.push(`#v(2pt)`);
    bodyParts.push(`#line(length: 100%, stroke: 1pt + rgb("#333333"))`);
    bodyParts.push("#v(8pt)");
    for (const rubric of data.rubrics) {
      bodyParts.push(await renderRubricToTypst(rubric, assetStore));
      bodyParts.push("#v(10pt)");
    }
    if (bodyParts[bodyParts.length - 1] === "#v(10pt)") {
      bodyParts.pop();
    }
  }

  // 最后一页底部：左下 deskmate.pro，与右下角水印底部对齐
  bodyParts.push(`#place(bottom + left, dy: 0.7cm)[#text(size: 5.5pt, fill: rgb("#bbbbbb"))[deskmate.pro]]`);

  return [
    `#import "/base.typ": setup-document`,
    `#import "/components/header.typ": worksheet-header`,
    "",
    `#setup-document(title: ${toTypstString(data.title)}, paper: ${toTypstString(
      resolveTypstPaper(options.pageSize),
    )}, theme: ${toTypstString(theme)})`,
    ``,
    `// 每页右下角水印`,
    `#set page(background: place(bottom + right, dx: -1.5cm, dy: -1.8cm)[#image("/deskmate-watermark.svg", height: 8pt)])`,
    ``,
    `#worksheet-header(${toTypstString(data.title)}, course_name: ${toTypstString(
      data.courseName ?? "",
    )}, teacher_name: ${toTypstString(data.teacherName ?? "")}, date: ${toTypstString(
      data.date ?? "",
    )}, subtitle: ${toTypstString(subtitle)}, theme: ${toTypstString(theme)})`,
    `#v(12pt)`,
    ``,
    bodyParts.join("\n"),
  ].join("\n");
}

export async function buildWorksheetTypstSourcePreview(
  data: WorksheetRenderInput,
  options: { pageSize: PdfPageSize; templateVariant: WorksheetTemplateVariant },
) {
  const assetStore = new TypstAssetStore("worksheet-image");
  const source = await buildWorksheetDocument(data, options, assetStore);
  return {
    source,
    assets: assetStore.list(),
  };
}

export async function renderWorksheetTypstPdf(
  data: WorksheetRenderInput,
  options: { pageSize: PdfPageSize; templateVariant: WorksheetTemplateVariant },
) {
  const assetStore = new TypstAssetStore("worksheet-image");
  const mainFileContent = await buildWorksheetDocument(data, options, assetStore);
  return compileTypstPdf({
    mainFileContent,
    assets: assetStore.list(),
  });
}
