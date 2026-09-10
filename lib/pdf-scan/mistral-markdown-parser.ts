/**
 * Mistral OCR markdown 专用解析器。
 * 针对 Mistral OCR 输出的结构化 markdown 设计，处理：
 * - MC（选择题）：题号 + 题干 + (A)(B)(C)(D)(E)
 * - FR（问答题）：题号 + 题干 + 可能有子问题 (a)(b)(c)
 * - 跨页题目（题干在一页，选项在下一页）
 * - 共享上下文（图/表在题号之前，属于后面多道题）
 * - 表格引用 [tbl-N.html]
 * - 内嵌图片 ![](url)
 * - LaTeX 公式 $...$
 */

import type { ScannedQuestion } from "./types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ParsedQuestion = {
  questionNumber: number;
  stem: string;
  sharedContext: string;
  options: Record<string, string> | null;
  hasImage: boolean;
  sourcePageNumber: number;
  stemImages: string[];
  optionImages: Record<string, string[]>;
};

// ---------------------------------------------------------------------------
// Patterns
// ---------------------------------------------------------------------------

// 页眉页脚 — 忽略
const HEADER_FOOTER_PATTERN =
  /^(?:AP\s*(?:Micro|Macro|Calculus|Biology|Chemistry|Physics|History|Psychology|English|Management|Economics)[\w\s]*|#\s+Unit\s+\d+.*|AP\s*$|Management\s*$|S\s*O\s*F\s+OLYMPIADS?|SAMPLE\s+PAPER|CLASS[-\s]*\d+|N\s*S\s*O|SOF\s+NATIONAL|PATTERN\s*&?\s*MARKING|Total\s+Questions|Time\s*:\s*\d+|ACHIEVERS?\s+SECTION|ANSWER\s+KEY|Sample\s+Paper\s*\|)/i;

// 题号：行首 数字 + 点 + 空格或换行
const QUESTION_NUMBER_PATTERN = /^(\d+)\.\s*/m;

// 选项：(A) ... 到 (E) ...
const OPTION_PATTERN = /^\(([A-E])\)\s*(.*)/;

// 图片
const IMAGE_PATTERN = /!\[([^\]]*)\]\(([^)]+)\)/g;

// 题干引用上方图/表的模式（英文）
const REFERS_TO_FIGURE =
  /the\s+(graph|table|diagram|figure|chart|matrix|data|schedule|payoff\s*matrix|cost\s+and\s+revenue)\s+(above|below|shown|provided)/i;

// 题干引用图/表的模式（中文）
const REFERS_TO_FIGURE_CN = /(上图|上表|如图|如表|下图|下表|图中|表中)/;

// 共享上下文的标记模式 — 以下任一匹配说明该上下文为多题共享
const MULTI_QUESTION_MARKER =
  /the\s+following\s+(questions|two\s+questions|three\s+questions)\s+(refer|are\s+based|relate)|the\s+(graph|table|diagram|figure|chart)\s+shows|use\s+the\s+following\s+(graph|table|diagram|figure|data|information)|refer\s+to\s+the\s+(graph|table|diagram)/i;

// 表格引用
const TABLE_REF_PATTERN = /\[tbl-\d+\.html\]\(tbl-\d+\.html\)/g;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * 快速预读题干文本（不包含选项），用于判断是否引用了图/表
 */
function prereadStem(
  allLines: Array<{ text: string }>,
  startIndex: number,
  endIndex: number,
): string {
  const lines: string[] = [];
  for (let i = startIndex; i < endIndex; i++) {
    const trimmed = allLines[i].text.trim();
    if (OPTION_PATTERN.test(trimmed)) break; // 遇到选项就停
    lines.push(trimmed);
  }
  return lines.join(" ");
}

function isHeaderFooter(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  return HEADER_FOOTER_PATTERN.test(trimmed);
}

function isAnswerKeyStart(line: string) {
  return /^\s*\*?\*?ANSWER\s+KEY\*?\*?\s*$/i.test(line.trim());
}

function cleanLines(text: string): string[] {
  return text.split("\n");
}

function extractImageUrls(text: string): string[] {
  const urls: string[] = [];
  const pattern = /!\[([^\]]*)\]\(([^)]+)\)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    if (match[2]) urls.push(match[2]);
  }
  return urls;
}

function stripImageMarkdown(text: string): string {
  return text.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, "").trim();
}

function detectQuestionType(
  options: Record<string, string> | null,
  stem: string,
  optionImages?: Record<string, string[]>,
): "choice" | "short_answer" | "essay" {
  if (options && Object.keys(options).length >= 2) return "choice";
  if (optionImages && Object.keys(optionImages).length >= 2) return "choice";
  if (/\(a\)\s/i.test(stem)) return "short_answer";
  return "essay";
}

// ---------------------------------------------------------------------------
// Core parser
// ---------------------------------------------------------------------------

export function parseMistralOcrMarkdown(
  pages: Array<{ pageNumber: number; markdown: string }>,
): ParsedQuestion[] {
  // Step 1: 合并所有页面，标记页码边界
  type AnnotatedLine = { text: string; page: number };
  const allLines: AnnotatedLine[] = [];
  let reachedAnswerKey = false;

  for (const page of pages) {
    if (reachedAnswerKey) break;
    const lines = cleanLines(page.markdown);
    for (const line of lines) {
      if (isAnswerKeyStart(line)) {
        reachedAnswerKey = true;
        break;
      }
      // 跳过页眉页脚
      if (isHeaderFooter(line)) continue;
      allLines.push({ text: line, page: page.pageNumber });
    }
  }

  // Step 2: 找出所有题号位置
  type QuestionStart = { index: number; number: number; page: number };
  const questionStarts: QuestionStart[] = [];

  for (let i = 0; i < allLines.length; i++) {
    const match = allLines[i].text.match(QUESTION_NUMBER_PATTERN);
    if (match && allLines[i].text.trimStart().startsWith(match[0].trimStart())) {
      questionStarts.push({
        index: i,
        number: parseInt(match[1], 10),
        page: allLines[i].page,
      });
    }
  }

  if (questionStarts.length === 0) return [];

  // Step 3: 提取每道题的内容
  const questions: ParsedQuestion[] = [];

  for (let qi = 0; qi < questionStarts.length; qi++) {
    const start = questionStarts[qi];
    const endIndex =
      qi + 1 < questionStarts.length
        ? questionStarts[qi + 1].index
        : allLines.length;

    // 收集该题号之前的上下文（图、表、引导文本）
    let sharedContext = "";

    const contextStartIndex = qi === 0 ? 0 : endOfPreviousQuestion(allLines, questionStarts, qi);
    if (contextStartIndex < start.index) {
      const contextLines: string[] = [];
      for (let ci = contextStartIndex; ci < start.index; ci++) {
        const line = allLines[ci].text.trim();
        if (!line || isHeaderFooter(line)) continue;
        // 跳过纯图片行（可能是上一题选项区域泄漏的图片）
        const lineTextOnly = stripImageMarkdown(line);
        const lineHasImage = extractImageUrls(line).length > 0;
        if (lineHasImage && !lineTextOnly) continue;
        contextLines.push(line);
      }
      const directContext = contextLines.join("\n").trim();
      if (directContext) {
        sharedContext = directContext;
      }
    }

    // 决定是否继承前一道题的共享上下文
    // 规则：基于题干内容判断，不盲目按位置继承
    if (!sharedContext && qi > 0) {
      const prevQuestion = questions[questions.length - 1];
      if (
        prevQuestion &&
        prevQuestion.sharedContext &&
        prevQuestion.sourcePageNumber === start.page
      ) {
        // 先预读当前题的题干（到选项之前）
        const previewStem = prereadStem(allLines, start.index, endIndex);

        // 三种情况允许继承共享上下文：
        // 1. 前一道题的上下文明确说"以下多道题"
        const isExplicitMultiQuestion = MULTI_QUESTION_MARKER.test(
          prevQuestion.sharedContext,
        );
        // 2. 当前题干引用了"上方的图/表"
        const currentRefsFigure = REFERS_TO_FIGURE.test(previewStem);
        // 3. 当前题干里有"上图/上表/如图"等中文引用
        const currentRefsFigureCn = REFERS_TO_FIGURE_CN.test(previewStem);

        if (isExplicitMultiQuestion || currentRefsFigure || currentRefsFigureCn) {
          sharedContext = prevQuestion.sharedContext;
        }
      }
    }

    // 提取题干和选项，同时分离图片归属
    const questionLines: string[] = [];
    const options: Record<string, string> = {};
    const stemImageUrls: string[] = [];
    const optionImageMap: Record<string, string[]> = {};
    let currentOptionLabel: string | null = null;

    for (let li = start.index; li < endIndex; li++) {
      const rawLine = allLines[li].text;
      const trimmed = rawLine.trim();

      // 第一行去掉题号前缀
      if (li === start.index) {
        const withoutNumber = rawLine.replace(QUESTION_NUMBER_PATTERN, "").trim();
        if (withoutNumber) {
          const optMatch = withoutNumber.match(OPTION_PATTERN);
          if (optMatch) {
            currentOptionLabel = optMatch[1];
            options[currentOptionLabel] = optMatch[2].trim();
            const imgs = extractImageUrls(optMatch[2]);
            if (imgs.length > 0) {
              optionImageMap[currentOptionLabel] = [...(optionImageMap[currentOptionLabel] ?? []), ...imgs];
            }
          } else {
            questionLines.push(withoutNumber);
            stemImageUrls.push(...extractImageUrls(withoutNumber));
          }
        }
        continue;
      }

      // 选项行
      const optMatch = trimmed.match(OPTION_PATTERN);
      if (optMatch) {
        currentOptionLabel = optMatch[1];
        options[currentOptionLabel] = optMatch[2].trim();
        const imgs = extractImageUrls(optMatch[2]);
        if (imgs.length > 0) {
          optionImageMap[currentOptionLabel] = [...(optionImageMap[currentOptionLabel] ?? []), ...imgs];
        }
        continue;
      }

      // 选项续行
      if (currentOptionLabel && trimmed && !QUESTION_NUMBER_PATTERN.test(trimmed)) {
        // 如果续行是纯图片行（只有 ![...](...) 没有其他文字），
        // 且当前选项已经有了图片，不再追加到这个选项
        // （避免下一题的图片被错误归入当前选项）
        const lineTextOnly = stripImageMarkdown(trimmed);
        const lineImages = extractImageUrls(trimmed);
        const optionAlreadyHasImage = (optionImageMap[currentOptionLabel] ?? []).length > 0;

        if (lineImages.length > 0 && !lineTextOnly && optionAlreadyHasImage) {
          // 纯图片续行，但当前选项已有图片 → 可能是下一题的图片，不归入选项
          // 保留为"孤立图片"，暂不归属
          currentOptionLabel = null;
          continue;
        }

        options[currentOptionLabel] += " " + trimmed;
        if (lineImages.length > 0) {
          optionImageMap[currentOptionLabel] = [...(optionImageMap[currentOptionLabel] ?? []), ...lineImages];
        }
        continue;
      }

      // 题干行
      if (trimmed) {
        currentOptionLabel = null;
        // 如果这一行是纯图片行，且出现在选项区域之后（说明前面已经有选项了），
        // 可能是下一题泄漏的图片，不归入当前题干
        const lineTextOnly = stripImageMarkdown(trimmed);
        const lineImages = extractImageUrls(trimmed);
        const hasSeenOptions = Object.keys(options).length > 0;

        if (lineImages.length > 0 && !lineTextOnly && hasSeenOptions) {
          // 选项区域后的纯图片行 → 跳过（可能是下一题的图片）
          continue;
        }

        questionLines.push(trimmed);
        stemImageUrls.push(...extractImageUrls(trimmed));
      }
    }

    const stem = questionLines.join("\n").trim();
    const hasOptions = Object.keys(options).length >= 2;
    const hasImage = IMAGE_PATTERN.test(stem) || IMAGE_PATTERN.test(sharedContext);
    IMAGE_PATTERN.lastIndex = 0;

    // 共享上下文中的图片也归为题干图片
    const contextImages = extractImageUrls(sharedContext);
    const allStemImages = [...contextImages, ...stemImageUrls];

    const fullStem = sharedContext
      ? `${sharedContext}\n\n${stem}`
      : stem;

    // 检测选项中是否有图片——如果有，确保识别为选择题
    const hasOptionImages = Object.values(optionImageMap).some((imgs) => imgs.length > 0);

    questions.push({
      questionNumber: start.number,
      stem: fullStem,
      sharedContext,
      options: hasOptions || hasOptionImages ? options : null,
      hasImage,
      sourcePageNumber: start.page,
      stemImages: allStemImages,
      optionImages: optionImageMap,
    });
  }

  return questions;
}

/**
 * 找到上一道题选项结束的位置（用于确定共享上下文的起始点）
 */
function endOfPreviousQuestion(
  allLines: Array<{ text: string; page: number }>,
  starts: Array<{ index: number; number: number; page: number }>,
  currentQi: number,
): number {
  if (currentQi === 0) return 0;
  const prevStart = starts[currentQi - 1];
  const currentStart = starts[currentQi];

  // 从当前题号往前找，找到最后一个选项行之后的位置
  for (let i = currentStart.index - 1; i > prevStart.index; i--) {
    const trimmed = allLines[i].text.trim();
    if (OPTION_PATTERN.test(trimmed)) {
      return i + 1;
    }
  }
  return prevStart.index + 1;
}

// ---------------------------------------------------------------------------
// Convert to ScannedQuestion format
// ---------------------------------------------------------------------------

export function convertToScannedQuestions(
  parsed: ParsedQuestion[],
): ScannedQuestion[] {
  return parsed.map((q) => {
    const questionType = detectQuestionType(q.options, q.stem, q.optionImages);
    const hasOptionImages = Object.values(q.optionImages).some((imgs) => imgs.length > 0);

    // 题干内容：移除图片 markdown（图片通过 linkedFigures 单独渲染）
    const stemContent = q.stemImages.length > 0
      ? stripImageMarkdown(q.stem)
      : q.stem;

    // 选项：如果选项有图片，保留图片 markdown 在选项文本中
    // （图片已经是 ![](url) 格式，前端可以直接渲染）
    const finalOptions = q.options ? { ...q.options } : null;

    // 题干图片 → linkedFigures（去重）
    const stemFigures = Array.from(new Set(q.stemImages));

    return {
      questionNumber: q.questionNumber,
      content: stemContent || q.stem,
      questionType: hasOptionImages ? "choice" : questionType,
      difficulty: "medium" as const,
      subject: "",
      knowledgePoint: "",
      options: finalOptions,
      confidence: questionType === "choice" || hasOptionImages ? 92 : 75,
      subQuestions: [],
      linkedFigures: stemFigures,
      sourcePageNumber: q.sourcePageNumber,
      sourceType: "pdf" as const,
    };
  });
}
