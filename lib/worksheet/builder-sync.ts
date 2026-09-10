import type { QuestionBlock } from "@/lib/doc-engine/block-types";
import {
  buildExerciseTitleFromContent,
  markdownToExerciseContentLeaves,
} from "@/lib/exercises/content";
import { extractArticleBodyHtml } from "@/lib/doc-engine/document-article-html";
import { buildWorksheetBuilderDocument } from "@/lib/worksheet/builder-store";
import { documentHtmlToMarkdown } from "@/lib/worksheet/builder-export";
import type {
  WorksheetBuilderDraft,
  WorksheetBuilderQuestionInstance,
} from "@/lib/worksheet/builder-types";
import {
  toExerciseDifficulty,
  type ExerciseContent,
  type ExerciseContentLeaf,
  type ExerciseDifficulty,
  type ExerciseOption,
  type ExerciseType,
} from "@/types/exercise";

type ParsedQuestionOption = ExerciseOption & {
  blocks: ExerciseContentLeaf[];
};

type ParsedQuestionBlock = {
  number: number;
  points: number | null;
  difficulty: string | null;
  questionType: "mc" | "frq" | "fill" | "tf";
  instanceId: string | null;
  sourceExerciseId: string | null;
  stem: string;
  stemBlocks: ExerciseContentLeaf[];
  options: ParsedQuestionOption[] | null;
  correctAnswer: string | null;
  answerBlocks: ExerciseContentLeaf[] | null;
  sampleAnswer: string | null;
  sampleAnswerBlocks: ExerciseContentLeaf[] | null;
  explanation: string | null;
  explanationBlocks: ExerciseContentLeaf[] | null;
};

function cleanText(value: string | null | undefined) {
  return `${value ?? ""}`.replace(/\s+/g, " ").trim();
}

function readAttribute(openTag: string, name: string) {
  const pattern = new RegExp(`${name}="([^"]*)"`, "i");
  const match = openTag.match(pattern);
  return match?.[1]?.trim() || null;
}

function findBalancedElementEnd(html: string, startIndex: number, tagName: string) {
  const openPattern = new RegExp(`<${tagName}\\b`, "gi");
  const closePattern = new RegExp(`</${tagName}>`, "gi");
  let depth = 0;
  let cursor = startIndex;

  while (cursor < html.length) {
    openPattern.lastIndex = cursor;
    closePattern.lastIndex = cursor;
    const nextOpen = openPattern.exec(html);
    const nextClose = closePattern.exec(html);

    if (!nextClose) return null;

    if (nextOpen && nextOpen.index < nextClose.index) {
      depth += 1;
      const openEnd = html.indexOf(">", nextOpen.index);
      if (openEnd < 0) return null;
      cursor = openEnd + 1;
      continue;
    }

    depth -= 1;
    cursor = nextClose.index + nextClose[0].length;
    if (depth === 0) return cursor;
  }

  return null;
}

function extractFirstBalancedElement(
  html: string,
  openTagPattern: RegExp,
  tagName: string,
) {
  const match = openTagPattern.exec(html);
  if (!match || match.index == null) return null;

  const start = match.index;
  const openTagEnd = html.indexOf(">", start);
  if (openTagEnd < 0) return null;

  const end = findBalancedElementEnd(html, start, tagName);
  if (!end) return null;

  return {
    start,
    end,
    html: html.slice(start, end),
    openTag: html.slice(start, openTagEnd + 1),
    innerHtml: html.slice(openTagEnd + 1, end - `</${tagName}>`.length),
  };
}

function removeSegment(source: string, segment: string | null | undefined) {
  if (!segment) return source;
  return source.replace(segment, "");
}

function stripNumberPrefix(value: string, number: number) {
  const escaped = String(number).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return value
    .replace(new RegExp(`^\\*\\*\\s*${escaped}[.)、．:：]?\\s*\\*\\*\\s*`, "i"), "")
    .replace(new RegExp(`^${escaped}[.)、．:：]?\\s*`, "i"), "")
    .trim();
}

function parseDifficulty(value: string | null) {
  if (!value) return null;
  const lower = value.toLowerCase();
  if (lower === "easy" || lower === "medium" || lower === "hard") return lower;
  // 向后兼容旧数字格式
  const parsed = Number(value);
  if (Number.isFinite(parsed)) {
    if (parsed <= 1) return "easy";
    if (parsed >= 3) return "hard";
    return "medium";
  }
  return null;
}

function parsePointValue(value: string | null) {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function wrapHtmlFragment(fragment: string) {
  return `<article data-doc-type="worksheet">${fragment}</article>`;
}

function fragmentHtmlToMarkdown(fragment: string) {
  return documentHtmlToMarkdown(wrapHtmlFragment(fragment));
}

function parseOptionItems(listHtml: string) {
  const matches = Array.from(listHtml.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi));
  if (matches.length === 0) return null;

  const options: ParsedQuestionOption[] = [];

  for (const [index, match] of matches.entries()) {
    const text = fragmentHtmlToMarkdown(match[1]);
    if (!text) continue;
    options.push({
      label: String.fromCharCode(65 + index),
      text,
      blocks: markdownToExerciseContentLeaves(text),
      isCorrect: false,
    });
  }

  return options.length > 0 ? options : null;
}

function parseQuestionHtml(questionHtml: string): ParsedQuestionBlock | null {
  const openTagMatch = questionHtml.match(/^<div\b[^>]*>/i);
  if (!openTagMatch) return null;

  const openTag = openTagMatch[0];
  const innerHtml = questionHtml
    .slice(openTag.length)
    .replace(/<\/div>\s*$/i, "");

  const numberRaw = readAttribute(openTag, "data-question");
  const number = Number(numberRaw);
  if (!Number.isFinite(number)) return null;

  const optionsElement = extractFirstBalancedElement(
    innerHtml,
    /<ol\b[^>]*data-options[^>]*>/i,
    "ol",
  );
  const answerSpaceElement = extractFirstBalancedElement(
    innerHtml,
    /<div\b[^>]*data-answer-space[^>]*>/i,
    "div",
  );
  const explanationElement = extractFirstBalancedElement(
    innerHtml,
    /<blockquote\b[^>]*>/i,
    "blockquote",
  );
  const answerMatch = innerHtml.match(
    /<p\b[^>]*>\s*<strong>\s*答案[:：]?\s*<\/strong>([\s\S]*?)<\/p>/i,
  );
  const sampleAnswerMatch = innerHtml.match(
    /<p\b[^>]*>\s*<strong>\s*参考答案[:：]?\s*<\/strong>([\s\S]*?)<\/p>/i,
  );

  let stemHtml = innerHtml;
  stemHtml = removeSegment(stemHtml, optionsElement?.html);
  stemHtml = removeSegment(stemHtml, answerSpaceElement?.html);
  stemHtml = removeSegment(stemHtml, explanationElement?.html);
  stemHtml = removeSegment(stemHtml, answerMatch?.[0]);
  stemHtml = removeSegment(stemHtml, sampleAnswerMatch?.[0]);

  const stem = stripNumberPrefix(fragmentHtmlToMarkdown(stemHtml), number);
  const stemBlocks = markdownToExerciseContentLeaves(stem);
  const options = optionsElement ? parseOptionItems(optionsElement.innerHtml) : null;
  const explanation = explanationElement
    ? fragmentHtmlToMarkdown(explanationElement.innerHtml)
    : null;
  const explanationBlocks = explanation
    ? markdownToExerciseContentLeaves(explanation)
    : null;
  const correctAnswer = answerMatch?.[1]
    ? fragmentHtmlToMarkdown(answerMatch[1])
    : null;
  const answerBlocks = correctAnswer
    ? markdownToExerciseContentLeaves(correctAnswer)
    : null;
  const sampleAnswer = sampleAnswerMatch?.[1]
    ? fragmentHtmlToMarkdown(sampleAnswerMatch[1])
    : null;
  const sampleAnswerBlocks = sampleAnswer
    ? markdownToExerciseContentLeaves(sampleAnswer)
    : null;

  const attrQuestionType = readAttribute(openTag, "data-question-type");
  const questionType =
    attrQuestionType === "mc" ||
    attrQuestionType === "frq" ||
    attrQuestionType === "fill" ||
    attrQuestionType === "tf"
      ? attrQuestionType
      : options
        ? "mc"
        : answerSpaceElement
          ? "frq"
          : "fill";

  return {
    number,
    points: parsePointValue(readAttribute(openTag, "data-points")),
    difficulty: parseDifficulty(readAttribute(openTag, "data-difficulty")),
    questionType,
    instanceId: readAttribute(openTag, "data-instance-id"),
    sourceExerciseId: readAttribute(openTag, "data-source-exercise-id"),
    stem,
    stemBlocks,
    options,
    correctAnswer,
    answerBlocks,
    sampleAnswer,
    sampleAnswerBlocks,
    explanation,
    explanationBlocks,
  };
}

function extractQuestionHtmlBlocks(html: string) {
  const body = extractArticleBodyHtml(html);
  const matches = Array.from(body.matchAll(/<div\b[^>]*data-question[^>]*>/gi));
  const blocks: string[] = [];

  for (const match of matches) {
    if (match.index == null) continue;
    const end = findBalancedElementEnd(body, match.index, "div");
    if (!end) continue;
    blocks.push(body.slice(match.index, end));
  }

  return blocks;
}

function resolveExerciseType(questionType: ParsedQuestionBlock["questionType"]): ExerciseType {
  if (questionType === "mc") return "MC";
  if (questionType === "frq") return "FR";
  return "fill_in";
}

function buildQuestionBlockFromParsed(
  parsed: ParsedQuestionBlock,
  instanceId: string,
  sourceExerciseId: string,
): QuestionBlock {
  if (parsed.questionType === "mc") {
    return {
      id: crypto.randomUUID(),
      type: "question",
      data: {
        instanceId,
        sourceExerciseId,
        number: parsed.number,
        stem: parsed.stem,
        stemBlocks: parsed.stemBlocks,
        questionType: "mc",
        points: parsed.points ?? undefined,
        difficulty: parsed.difficulty,
        options: parsed.options ?? [],
        correctAnswer: parsed.correctAnswer,
        answerBlocks: parsed.answerBlocks,
        explanation: parsed.explanation,
        explanationBlocks: parsed.explanationBlocks,
      },
    };
  }

  if (parsed.questionType === "frq") {
    return {
      id: crypto.randomUUID(),
      type: "question",
      data: {
        instanceId,
        sourceExerciseId,
        number: parsed.number,
        stem: parsed.stem,
        stemBlocks: parsed.stemBlocks,
        questionType: "frq",
        points: parsed.points ?? undefined,
        difficulty: parsed.difficulty,
        answerSpace: "medium",
        sampleAnswer: parsed.sampleAnswer ?? parsed.correctAnswer,
        sampleAnswerBlocks: parsed.sampleAnswerBlocks ?? parsed.answerBlocks,
        explanation: parsed.explanation,
        explanationBlocks: parsed.explanationBlocks,
      },
    };
  }

  if (parsed.questionType === "tf") {
    return {
      id: crypto.randomUUID(),
      type: "question",
      data: {
        instanceId,
        sourceExerciseId,
        number: parsed.number,
        stem: parsed.stem,
        stemBlocks: parsed.stemBlocks,
        questionType: "tf",
        points: parsed.points ?? undefined,
        difficulty: parsed.difficulty,
        correctAnswer:
          parsed.correctAnswer?.toLowerCase() === "true"
            ? true
            : parsed.correctAnswer?.toLowerCase() === "false"
              ? false
              : null,
        answerBlocks: parsed.answerBlocks,
        explanation: parsed.explanation,
        explanationBlocks: parsed.explanationBlocks,
      },
    };
  }

  return {
    id: crypto.randomUUID(),
    type: "question",
    data: {
      instanceId,
      sourceExerciseId,
      number: parsed.number,
      stem: parsed.stem,
      stemBlocks: parsed.stemBlocks,
      questionType: "fill",
      points: parsed.points ?? undefined,
      difficulty: parsed.difficulty,
      explanation: parsed.explanation,
      explanationBlocks: parsed.explanationBlocks,
    },
  };
}

function buildQuestionContentFromParsed(parsed: ParsedQuestionBlock): ExerciseContent {
  return {
    version: 1,
    type:
      parsed.questionType === "mc"
        ? "MC"
        : parsed.questionType === "tf"
          ? "TF"
          : parsed.questionType === "fill"
            ? "fill_in"
            : "FR",
    stem: parsed.stemBlocks,
    options:
      parsed.questionType === "mc"
        ? (parsed.options ?? []).map((option) => ({
            id: crypto.randomUUID(),
            label: option.label,
            blocks: option.blocks,
            isCorrect: option.isCorrect,
          }))
        : null,
    answer: parsed.sampleAnswerBlocks ?? parsed.answerBlocks,
    explanation: parsed.explanationBlocks,
    answerSpace: parsed.questionType === "frq" ? "medium" : null,
    commonMistakes: [],
  };
}

function findMatchingPreviousInstance(params: {
  parsed: ParsedQuestionBlock;
  index: number;
  previous: WorksheetBuilderQuestionInstance[];
  consumedIds: Set<string>;
}) {
  const { parsed, index, previous, consumedIds } = params;

  const byInstanceId = parsed.instanceId
    ? previous.find(
        (instance) =>
          instance.instanceId === parsed.instanceId &&
          !consumedIds.has(instance.instanceId),
      )
    : null;
  if (byInstanceId) return byInstanceId;
  if (parsed.instanceId) return null;

  const byOriginExerciseId = parsed.sourceExerciseId
    ? previous.find(
        (instance) =>
          instance.originExerciseId === parsed.sourceExerciseId &&
          !consumedIds.has(instance.instanceId),
      )
    : null;
  if (byOriginExerciseId) return byOriginExerciseId;
  if (parsed.sourceExerciseId) return null;

  const byIndex = previous[index];
  if (byIndex && !consumedIds.has(byIndex.instanceId)) return byIndex;
  return null;
}

function ensureUniqueId(candidate: string | null | undefined, usedIds: Set<string>) {
  if (candidate && !usedIds.has(candidate)) {
    usedIds.add(candidate);
    return candidate;
  }

  let nextId = crypto.randomUUID();
  while (usedIds.has(nextId)) {
    nextId = crypto.randomUUID();
  }
  usedIds.add(nextId);
  return nextId;
}

export function synchronizeWorksheetBuilderDraftFromHtml(params: {
  currentDraft: WorksheetBuilderDraft;
  html: string;
  title: string;
  courseName?: string | null;
  unitName?: string | null;
}) {
  const questionHtmlBlocks = extractQuestionHtmlBlocks(params.html);
  const parsedQuestions = questionHtmlBlocks
    .map((blockHtml) => parseQuestionHtml(blockHtml))
    .filter((question): question is ParsedQuestionBlock => question !== null);

  const consumedPreviousIds = new Set<string>();
  const usedNextIds = new Set<string>();

  const nextQuestionInstances = parsedQuestions.map((parsed, index) => {
    const previous = findMatchingPreviousInstance({
      parsed,
      index,
      previous: params.currentDraft.questionInstances,
      consumedIds: consumedPreviousIds,
    });

    if (previous) consumedPreviousIds.add(previous.instanceId);

    const instanceId = ensureUniqueId(
      previous?.instanceId ?? parsed.instanceId,
      usedNextIds,
    );
    const originExerciseId =
      previous?.originExerciseId ??
      parsed.sourceExerciseId ??
      `manual:${instanceId}`;
    const content = buildQuestionContentFromParsed(parsed);

    return {
      instanceId,
      originExerciseId,
      number: parsed.number,
      title: buildExerciseTitleFromContent(content),
      type: resolveExerciseType(parsed.questionType),
      difficulty:
        typeof parsed.difficulty === "string"
          ? toExerciseDifficulty(parsed.difficulty)
          : previous?.difficulty ?? ("medium" as ExerciseDifficulty),
      sourceLabel: previous?.sourceLabel ?? null,
      importedAt: previous?.importedAt ?? new Date().toISOString(),
      originSnapshot: previous?.originSnapshot ?? {
        content,
        questionText: parsed.stem,
        options: parsed.options,
        correctAnswer: parsed.correctAnswer ?? parsed.sampleAnswer ?? "",
        solutionSteps: parsed.explanation ?? "",
      },
      block: buildQuestionBlockFromParsed(parsed, instanceId, originExerciseId),
    } satisfies WorksheetBuilderQuestionInstance;
  });

  const nextDocument = buildWorksheetBuilderDocument({
    title: params.title,
    courseName: params.courseName,
    unitName: params.unitName,
    blocks: nextQuestionInstances.map((instance) => instance.block),
  });

  return {
    ...params.currentDraft,
    html: params.html,
    document: nextDocument,
    questionInstances: nextQuestionInstances,
    updatedAt: new Date().toISOString(),
  } satisfies WorksheetBuilderDraft;
}
