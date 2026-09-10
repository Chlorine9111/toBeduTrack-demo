import { type QuestionContentLeaf, type QuestionOption } from "@/lib/doc-engine/block-types";
import {
  buildDocumentArticleHtml,
  extractArticleBodyHtml,
  extractArticleDocumentType,
} from "@/lib/doc-engine/document-article-html";
import {
  buildExerciseTitleFromContent,
  exerciseContentLeavesToMarkdown,
} from "@/lib/exercises/content";
import { buildWorksheetBuilderDocument } from "@/lib/worksheet/builder-store";
import { synchronizeWorksheetBuilderDraftFromHtml } from "@/lib/worksheet/builder-sync";
import type {
  WorksheetBuilderDraft,
  WorksheetBuilderQuestionInstance,
} from "@/lib/worksheet/builder-types";
import { toExerciseDifficulty, type ExerciseDifficulty, type ExerciseType } from "@/types/exercise";

type QuestionSectionSegment = {
  instanceId: string | null;
  sourceExerciseId: string | null;
  sectionHtml: string;
  trailingGap: string;
};

type ParsedQuestionSections = {
  docType: string;
  prefix: string;
  sections: QuestionSectionSegment[];
};

export type BuilderQuestionImageRef = {
  leafId: string;
  imageIndex: number;
  label: string;
  src: string;
  alt: string;
};

export type BuilderQuestionTextBlockRef = {
  leafId: string;
  label: string;
  text: string;
};

export type BuilderQuestionContentTargetRef = {
  key: string;
  label: string;
};

export type BuilderManualQuestionType = "mc" | "frq" | "fill" | "tf";
export type BuilderInsertionMode = "before-active" | "after-active" | "append-end";
export type BuilderStructureInsertionMode = BuilderInsertionMode;

const OPTION_LABELS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

function readAttribute(html: string, name: string) {
  const pattern = new RegExp(`${name}="([^"]*)"`, "i");
  const match = html.match(pattern);
  return match?.[1]?.trim() || null;
}

function toStructureSectionKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-\u4e00-\u9fa5]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function escapeStructureText(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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

function parseQuestionSections(html: string): ParsedQuestionSections {
  const body = extractArticleBodyHtml(html);
  const docType = extractArticleDocumentType(html) || "worksheet";
  const matches = Array.from(body.matchAll(/<section\b[^>]*>/gi));
  const sections: QuestionSectionSegment[] = [];
  let lastQuestionEnd = 0;
  let prefix = body;

  for (const match of matches) {
    if (match.index == null) continue;
    const end = findBalancedElementEnd(body, match.index, "section");
    if (!end) continue;

    const sectionHtml = body.slice(match.index, end);
    if (!/data-question=/i.test(sectionHtml)) continue;

    if (sections.length === 0) {
      prefix = body.slice(0, match.index);
    } else {
      sections[sections.length - 1].trailingGap = body.slice(lastQuestionEnd, match.index);
    }

    sections.push({
      instanceId: readAttribute(sectionHtml, "data-instance-id"),
      sourceExerciseId: readAttribute(sectionHtml, "data-source-exercise-id"),
      sectionHtml,
      trailingGap: "",
    });
    lastQuestionEnd = end;
  }

  if (sections.length > 0) {
    sections[sections.length - 1].trailingGap = body.slice(lastQuestionEnd);
  }

  return {
    docType,
    prefix: sections.length > 0 ? prefix : body,
    sections,
  };
}

function replaceSectionDataNumber(sectionHtml: string, nextNumber: number) {
  let nextHtml = sectionHtml;

  nextHtml = nextHtml.replace(
    /data-section="question-[^"]*"/i,
    `data-section="question-${nextNumber}"`,
  );
  nextHtml = nextHtml.replace(
    /data-question="[^"]*"/i,
    `data-question="${nextNumber}"`,
  );

  const withStrong = nextHtml.replace(
    /(<p\b[^>]*>\s*<strong>\s*)\d+([.)、．:：]?)(\s*<\/strong>)/i,
    `$1${nextNumber}$2$3`,
  );
  if (withStrong !== nextHtml) return withStrong;

  return nextHtml.replace(
    /(<p\b[^>]*>\s*)(\d+)([.)、．:：]\s*)/i,
    `$1${nextNumber}$3`,
  );
}

function ensureQuestionSectionMetadata(params: {
  sectionHtml: string;
  instanceId?: string | null;
  sourceExerciseId?: string | null;
  questionType?: string | null;
  difficulty?: string | null;
}) {
  let nextHtml = params.sectionHtml;

  if (params.instanceId) {
    if (/data-instance-id="/i.test(nextHtml)) {
      nextHtml = nextHtml.replace(
        /data-instance-id="[^"]*"/i,
        `data-instance-id="${params.instanceId}"`,
      );
    } else {
      nextHtml = nextHtml.replace(
        /<div\b/i,
        `<div data-instance-id="${params.instanceId}"`,
      );
    }
  }

  if (params.sourceExerciseId) {
    if (/data-source-exercise-id="/i.test(nextHtml)) {
      nextHtml = nextHtml.replace(
        /data-source-exercise-id="[^"]*"/i,
        `data-source-exercise-id="${params.sourceExerciseId}"`,
      );
    } else {
      nextHtml = nextHtml.replace(
        /<div\b/i,
        `<div data-source-exercise-id="${params.sourceExerciseId}"`,
      );
    }
  }

  if (params.questionType) {
    if (/data-question-type="/i.test(nextHtml)) {
      nextHtml = nextHtml.replace(
        /data-question-type="[^"]*"/i,
        `data-question-type="${params.questionType}"`,
      );
    } else {
      nextHtml = nextHtml.replace(
        /<div\b/i,
        `<div data-question-type="${params.questionType}"`,
      );
    }
  }

  if (params.difficulty) {
    if (/data-difficulty="/i.test(nextHtml)) {
      nextHtml = nextHtml.replace(
        /data-difficulty="[^"]*"/i,
        `data-difficulty="${params.difficulty}"`,
      );
    } else {
      nextHtml = nextHtml.replace(
        /<div\b/i,
        `<div data-difficulty="${params.difficulty}"`,
      );
    }
  }

  return nextHtml;
}

function serializeQuestionSections(parsed: ParsedQuestionSections) {
  const body =
    parsed.sections.length === 0
      ? parsed.prefix
      : parsed.prefix +
        parsed.sections.map((section) => section.sectionHtml + section.trailingGap).join("");

  return `<article data-doc-type="${parsed.docType}">${body}</article>`;
}

function renumberSections(sections: QuestionSectionSegment[]) {
  return sections.map((section, index) => ({
    ...section,
    sectionHtml: replaceSectionDataNumber(section.sectionHtml, index + 1),
  }));
}

function findQuestionSection(
  parsed: ParsedQuestionSections,
  instanceId: string,
) {
  return parsed.sections.findIndex((section) => section.instanceId === instanceId);
}

function readImageRefsFromSection(sectionHtml: string): BuilderQuestionImageRef[] {
  const matches = Array.from(
    sectionHtml.matchAll(/<img\b[^>]*src="([^"]+)"[^>]*>/gi),
  );

  return matches.map((match, imageIndex) => {
    const tag = match[0];
    const altMatch = tag.match(/\balt="([^"]*)"/i);
    return {
      leafId: `legacy-image-${imageIndex}`,
      imageIndex,
      label: `图片 ${imageIndex + 1}`,
      src: match[1] ?? "",
      alt: altMatch?.[1] ?? "",
    } satisfies BuilderQuestionImageRef;
  });
}

function readQuestionNumberFromSection(sectionHtml: string) {
  const dataQuestion = readAttribute(sectionHtml, "data-question");
  const parsed = dataQuestion ? Number.parseInt(dataQuestion, 10) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function getOriginalSectionOpenTag(sectionHtml: string) {
  return sectionHtml.match(/^<section\b[^>]*>/i)?.[0] ?? "<section>";
}

function extractQuestionSectionHtml(replacementHtml: string) {
  const trimmed = replacementHtml.trim();
  if (!trimmed) return null;

  if (/^<section\b/i.test(trimmed)) {
    return trimmed;
  }

  if (/^<article\b/i.test(trimmed)) {
    const parsed = parseQuestionSections(trimmed);
    return parsed.sections[0]?.sectionHtml ?? null;
  }

  return null;
}

function normalizeQuestionSectionReplacement(params: {
  originalSectionHtml: string;
  replacementHtml: string;
}) {
  const originalInstanceId = readAttribute(params.originalSectionHtml, "data-instance-id");
  const originalSourceExerciseId = readAttribute(
    params.originalSectionHtml,
    "data-source-exercise-id",
  );
  const originalQuestionType = readAttribute(params.originalSectionHtml, "data-question-type");
  const originalDifficulty = readAttribute(params.originalSectionHtml, "data-difficulty");
  const questionNumber = readQuestionNumberFromSection(params.originalSectionHtml);
  const normalizedReplacement = extractQuestionSectionHtml(params.replacementHtml);

  let nextHtml = normalizedReplacement;
  if (!nextHtml) {
    nextHtml = [
      getOriginalSectionOpenTag(params.originalSectionHtml),
      params.replacementHtml.trim(),
      "</section>",
    ].join("");
  }

  nextHtml = ensureQuestionSectionMetadata({
    sectionHtml: nextHtml,
    instanceId: originalInstanceId,
    sourceExerciseId: originalSourceExerciseId,
    questionType: originalQuestionType,
    difficulty: originalDifficulty,
  });

  return replaceSectionDataNumber(nextHtml, questionNumber);
}

function cloneSection(section: QuestionSectionSegment) {
  const nextInstanceId = crypto.randomUUID();
  return {
    ...section,
    instanceId: nextInstanceId,
    sectionHtml: ensureQuestionSectionMetadata({
      sectionHtml: section.sectionHtml,
      instanceId: nextInstanceId,
      sourceExerciseId: section.sourceExerciseId,
    }),
    trailingGap: section.trailingGap,
  } satisfies QuestionSectionSegment;
}

function createBlankQuestionSection(
  number: number,
  questionType: BuilderManualQuestionType = "fill",
) {
  const instanceId = crypto.randomUUID();
  const sourceExerciseId = `manual:${instanceId}`;

  if (questionType === "mc") {
    return {
      instanceId,
      sourceExerciseId,
      sectionHtml: [
        `<section data-section="question-${number}">`,
        `<div data-question="${number}" data-difficulty="medium" data-instance-id="${instanceId}" data-source-exercise-id="${sourceExerciseId}" data-question-type="mc">`,
        `<p><strong>${number}.</strong> 在这里输入选择题题干</p>`,
        '<ol data-options="true" type="A">',
        "<li>新增选项 A</li>",
        "<li>新增选项 B</li>",
        "<li>新增选项 C</li>",
        "<li>新增选项 D</li>",
        "</ol>",
        "<p><strong>答案：</strong>A</p>",
        "<blockquote><p>在这里输入解析</p></blockquote>",
        "</div>",
        "</section>",
      ].join(""),
      trailingGap: "",
    } satisfies QuestionSectionSegment;
  }

  if (questionType === "frq") {
    return {
      instanceId,
      sourceExerciseId,
      sectionHtml: [
        `<section data-section="question-${number}">`,
        `<div data-question="${number}" data-difficulty="medium" data-instance-id="${instanceId}" data-source-exercise-id="${sourceExerciseId}" data-question-type="frq">`,
        `<p><strong>${number}.</strong> 在这里输入问答题题干</p>`,
        '<div data-answer-space="medium"></div>',
        "<p><strong>参考答案：</strong>在这里输入参考答案</p>",
        "<blockquote><p>在这里输入解析</p></blockquote>",
        "</div>",
        "</section>",
      ].join(""),
      trailingGap: "",
    } satisfies QuestionSectionSegment;
  }

  if (questionType === "tf") {
    return {
      instanceId,
      sourceExerciseId,
      sectionHtml: [
        `<section data-section="question-${number}">`,
        `<div data-question="${number}" data-difficulty="medium" data-instance-id="${instanceId}" data-source-exercise-id="${sourceExerciseId}" data-question-type="tf">`,
        `<p><strong>${number}.</strong> 在这里输入判断题题干</p>`,
        "<p><strong>答案：</strong>True</p>",
        "<blockquote><p>在这里输入解析</p></blockquote>",
        "</div>",
        "</section>",
      ].join(""),
      trailingGap: "",
    } satisfies QuestionSectionSegment;
  }

  return {
    instanceId,
    sourceExerciseId,
    sectionHtml: [
      `<section data-section="question-${number}">`,
      `<div data-question="${number}" data-difficulty="medium" data-instance-id="${instanceId}" data-source-exercise-id="${sourceExerciseId}" data-question-type="fill">`,
      `<p><strong>${number}.</strong> 在这里输入题干</p>`,
      "<p>可继续输入题目说明、选项，或粘贴图片。</p>",
      "</div>",
      "</section>",
    ].join(""),
    trailingGap: "",
  } satisfies QuestionSectionSegment;
}

function rebuildDraftFromSections(params: {
  currentDraft: WorksheetBuilderDraft;
  html: string;
  title: string;
}) {
  const courseName = params.currentDraft.document.meta.courseName;
  const unitName = params.currentDraft.document.meta.unitName;
  const synchronized = synchronizeWorksheetBuilderDraftFromHtml({
    currentDraft: params.currentDraft,
    html: params.html,
    title: params.title,
    courseName,
    unitName,
  });

  const nextDocument = buildWorksheetBuilderDocument({
    title: params.title,
    courseName,
    unitName,
    blocks: synchronized.questionInstances.map((instance) => instance.block),
  });

  return {
    ...synchronized,
    document: nextDocument,
    html: params.html,
    updatedAt: new Date().toISOString(),
  } satisfies WorksheetBuilderDraft;
}

function insertFragmentIntoParsedSections(params: {
  parsed: ParsedQuestionSections;
  fragmentHtml: string;
  mode?: BuilderInsertionMode;
  referenceInstanceId?: string | null;
}) {
  const fragment = params.fragmentHtml.trim();
  if (!fragment) return params.parsed;

  const nextParsed: ParsedQuestionSections = {
    ...params.parsed,
    sections: params.parsed.sections.map((section) => ({ ...section })),
  };

  const referenceInstanceId = params.referenceInstanceId?.trim() || null;

  if (params.mode === "before-active" && referenceInstanceId) {
    const index = findQuestionSection(nextParsed, referenceInstanceId);
    if (index >= 0) {
      if (index === 0) {
        nextParsed.prefix = `${nextParsed.prefix}${fragment}`;
        return nextParsed;
      }

      nextParsed.sections[index - 1] = {
        ...nextParsed.sections[index - 1]!,
        trailingGap: `${nextParsed.sections[index - 1]?.trailingGap ?? ""}${fragment}`,
      };
      return nextParsed;
    }
  }

  if (params.mode === "after-active" && referenceInstanceId) {
    const index = findQuestionSection(nextParsed, referenceInstanceId);
    if (index >= 0) {
      nextParsed.sections[index] = {
        ...nextParsed.sections[index]!,
        trailingGap: fragment + (nextParsed.sections[index]?.trailingGap ?? ""),
      };
      return nextParsed;
    }
  }

  if (nextParsed.sections.length === 0) {
    nextParsed.prefix = `${nextParsed.prefix}${fragment}`;
    return nextParsed;
  }

  const lastIndex = nextParsed.sections.length - 1;
  nextParsed.sections[lastIndex] = {
    ...nextParsed.sections[lastIndex]!,
    trailingGap: `${nextParsed.sections[lastIndex]?.trailingGap ?? ""}${fragment}`,
  };
  return nextParsed;
}

function insertStructureFragmentInBuilderDraft(params: {
  draft: WorksheetBuilderDraft;
  title: string;
  fragmentHtml: string;
  mode?: BuilderInsertionMode;
  referenceInstanceId?: string | null;
}) {
  const parsed = parseQuestionSections(params.draft.html);
  const nextParsed = insertFragmentIntoParsedSections({
    parsed,
    fragmentHtml: params.fragmentHtml,
    mode: params.mode,
    referenceInstanceId: params.referenceInstanceId,
  });

  return rebuildDraftFromSections({
    currentDraft: params.draft,
    html: serializeQuestionSections(nextParsed),
    title: params.title,
  });
}

function renderQuestionSectionHtml(params: {
  currentDraft: WorksheetBuilderDraft;
  title: string;
  instance: WorksheetBuilderQuestionInstance;
}) {
  const html = buildDocumentArticleHtml({
    id: crypto.randomUUID(),
    type: params.currentDraft.document.type,
    title: params.title,
    meta: {
      courseName: params.currentDraft.document.meta.courseName ?? null,
      unitName: params.currentDraft.document.meta.unitName ?? null,
    },
    blocks: [params.instance.block],
    layoutConfig: params.currentDraft.document.layoutConfig,
  });

  if (!html) return null;
  return parseQuestionSections(html).sections[0]?.sectionHtml ?? null;
}

function renumberQuestionInstance(
  instance: WorksheetBuilderQuestionInstance,
  nextNumber: number,
) {
  return {
    ...instance,
    number: nextNumber,
    block: {
      ...instance.block,
      data: {
        ...instance.block.data,
        number: nextNumber,
      },
    },
  } satisfies WorksheetBuilderQuestionInstance;
}

function rebuildDraftFromQuestionInstances(params: {
  currentDraft: WorksheetBuilderDraft;
  title: string;
  questionInstances: WorksheetBuilderQuestionInstance[];
}) {
  const courseName = params.currentDraft.document.meta.courseName;
  const unitName = params.currentDraft.document.meta.unitName;
  const nextQuestionInstances = params.questionInstances.map((instance, index) =>
    renumberQuestionInstance(instance, index + 1),
  );
  const nextDocument = buildWorksheetBuilderDocument({
    title: params.title,
    courseName,
    unitName,
    blocks: nextQuestionInstances.map((instance) => instance.block),
  });
  const currentSections = parseQuestionSections(params.currentDraft.html);
  const rebuiltHtml =
    currentSections.sections.length === nextQuestionInstances.length
      ? serializeQuestionSections({
          ...currentSections,
          sections: currentSections.sections.map((section, index) => ({
            ...section,
            sectionHtml:
              renderQuestionSectionHtml({
                currentDraft: params.currentDraft,
                title: params.title,
                instance: nextQuestionInstances[index]!,
              }) ?? section.sectionHtml,
          })),
        })
      : null;

  return {
    ...params.currentDraft,
    html:
      rebuiltHtml ??
      buildDocumentArticleHtml(nextDocument) ??
      params.currentDraft.html,
    document: nextDocument,
    questionInstances: nextQuestionInstances,
    updatedAt: new Date().toISOString(),
  } satisfies WorksheetBuilderDraft;
}

function resolveQuestionInstanceType(
  questionType: WorksheetBuilderQuestionInstance["block"]["data"]["questionType"],
): ExerciseType {
  if (questionType === "mc") return "MC";
  if (questionType === "frq") return "FR";
  return "fill_in";
}

function resolveQuestionInstanceDifficulty(
  currentDifficulty: ExerciseDifficulty,
  nextDifficulty: string | null | undefined,
): ExerciseDifficulty {
  return typeof nextDifficulty === "string"
    ? toExerciseDifficulty(nextDifficulty)
    : currentDifficulty;
}

function syncTextLeafInCollection(
  blocks: QuestionContentLeaf[] | null | undefined,
  text: string,
) {
  const nextBlocks: QuestionContentLeaf[] = [...(blocks ?? [])];
  const textIndex = nextBlocks.findIndex((block) => block.kind === "text");

  if (textIndex >= 0) {
    const current = nextBlocks[textIndex];
    if (current?.kind === "text") {
      nextBlocks[textIndex] = {
        ...current,
        text,
      };
    }
    return nextBlocks;
  }

  return [
    {
      id: crypto.randomUUID(),
      kind: "text" as const,
      text,
    },
    ...nextBlocks,
  ] satisfies QuestionContentLeaf[];
}

function getOptionLabelByIndex(index: number) {
  return OPTION_LABELS[index] ?? `Option ${index + 1}`;
}

function createTextLeaf(text: string): QuestionContentLeaf {
  return {
    id: crypto.randomUUID(),
    kind: "text",
    text,
  };
}

function readQuestionAnswerText(instance: WorksheetBuilderQuestionInstance) {
  const data = instance.block.data;
  if (data.questionType === "mc") {
    return data.correctAnswer?.trim() || "A";
  }
  if (data.questionType === "frq") {
    return data.sampleAnswer?.trim() || "在这里输入参考答案";
  }
  if (data.questionType === "tf") {
    return data.correctAnswer === false ? "False" : "True";
  }
  return instance.originSnapshot.correctAnswer?.trim() || "";
}

function readQuestionAnswerBlocks(instance: WorksheetBuilderQuestionInstance) {
  const data = instance.block.data;
  if (data.questionType === "mc") {
    return data.answerBlocks ?? [createTextLeaf(data.correctAnswer?.trim() || "A")];
  }
  if (data.questionType === "frq") {
    return data.sampleAnswerBlocks ?? [createTextLeaf(data.sampleAnswer?.trim() || "在这里输入参考答案")];
  }
  if (data.questionType === "tf") {
    return data.answerBlocks ?? [createTextLeaf(data.correctAnswer === false ? "False" : "True")];
  }
  return [createTextLeaf(instance.originSnapshot.correctAnswer?.trim() || "在这里输入参考答案")];
}

function createDefaultMcOptions(): QuestionOption[] {
  return OPTION_LABELS.slice(0, 4).map((label) => ({
    label,
    text: `新增选项 ${label}`,
    blocks: [createTextLeaf(`新增选项 ${label}`)],
    isCorrect: label === "A",
  }));
}

export function formatBuilderQuestionTypeLabel(questionType: BuilderManualQuestionType) {
  if (questionType === "mc") return "选择题";
  if (questionType === "frq") return "问答题";
  if (questionType === "tf") return "判断题";
  return "填空题";
}

export function insertSectionTitleInBuilderDraft(params: {
  draft: WorksheetBuilderDraft;
  title: string;
  sectionTitle: string;
  mode?: BuilderInsertionMode;
  referenceInstanceId?: string | null;
}) {
  const normalizedTitle = params.sectionTitle.trim();
  if (!normalizedTitle) return params.draft;

  return insertStructureFragmentInBuilderDraft({
    draft: params.draft,
    title: params.title,
    mode: params.mode,
    referenceInstanceId: params.referenceInstanceId,
    fragmentHtml: [
      `<section data-section="${toStructureSectionKey(normalizedTitle) || crypto.randomUUID()}">`,
      `<h2>${escapeStructureText(normalizedTitle)}</h2>`,
      "</section>",
    ].join(""),
  });
}

export function insertInstructionBlockInBuilderDraft(params: {
  draft: WorksheetBuilderDraft;
  title: string;
  text: string;
  mode?: BuilderInsertionMode;
  referenceInstanceId?: string | null;
}) {
  const normalizedText = params.text.trim();
  if (!normalizedText) return params.draft;

  return insertStructureFragmentInBuilderDraft({
    draft: params.draft,
    title: params.title,
    mode: params.mode,
    referenceInstanceId: params.referenceInstanceId,
    fragmentHtml: [
      `<section data-section="instruction-${crypto.randomUUID()}">`,
      `<p>${escapeStructureText(normalizedText)}</p>`,
      "</section>",
    ].join(""),
  });
}

export function insertPageBreakInBuilderDraft(params: {
  draft: WorksheetBuilderDraft;
  title: string;
  mode?: BuilderInsertionMode;
  referenceInstanceId?: string | null;
}) {
  return insertStructureFragmentInBuilderDraft({
    draft: params.draft,
    title: params.title,
    mode: params.mode,
    referenceInstanceId: params.referenceInstanceId,
    fragmentHtml: '<hr data-page-break="true" />',
  });
}

function updateLeafTextInCollection(
  blocks: QuestionContentLeaf[] | null | undefined,
  leafId: string,
  text: string,
) {
  let changed = false;
  const nextBlocks = (blocks ?? []).map((block) => {
    if (block.kind !== "text" || block.id !== leafId) {
      return block;
    }

    changed = true;
    return {
      ...block,
      text,
    };
  });

  return {
    blocks: nextBlocks,
    changed,
  };
}

function listTextBlocksFromQuestionInstance(instance: WorksheetBuilderQuestionInstance) {
  const refs: BuilderQuestionTextBlockRef[] = [];
  const data = instance.block.data;

  (data.stemBlocks ?? []).forEach((block, index) => {
    if (block.kind !== "text") return;
    refs.push({
      leafId: block.id,
      label: `题干文本 ${index + 1}`,
      text: block.text,
    });
  });

  if ("options" in data) {
    data.options.forEach((option) => {
      (option.blocks ?? []).forEach((block, index) => {
        if (block.kind !== "text") return;
        refs.push({
          leafId: block.id,
          label: `选项 ${option.label} 文本 ${index + 1}`,
          text: block.text,
        });
      });
    });
  }

  if ("answerBlocks" in data) {
    (data.answerBlocks ?? []).forEach((block, index) => {
      if (block.kind !== "text") return;
      refs.push({
        leafId: block.id,
        label: `答案文本 ${index + 1}`,
        text: block.text,
      });
    });
  }

  if ("sampleAnswerBlocks" in data) {
    (data.sampleAnswerBlocks ?? []).forEach((block, index) => {
      if (block.kind !== "text") return;
      refs.push({
        leafId: block.id,
        label: `参考答案文本 ${index + 1}`,
        text: block.text,
      });
    });
  }

  if ("explanationBlocks" in data) {
    (data.explanationBlocks ?? []).forEach((block, index) => {
      if (block.kind !== "text") return;
      refs.push({
        leafId: block.id,
        label: `解析文本 ${index + 1}`,
        text: block.text,
      });
    });
  }

  return refs;
}

function listImageBlocksFromQuestionInstance(instance: WorksheetBuilderQuestionInstance) {
  const refs: BuilderQuestionImageRef[] = [];
  const data = instance.block.data;

  let imageIndex = 0;
  const pushImageBlocks = (
    labelPrefix: string,
    blocks: QuestionContentLeaf[] | null | undefined,
  ) => {
    let localIndex = 0;
    (blocks ?? []).forEach((block) => {
      if (block.kind !== "image") return;
      localIndex += 1;
      refs.push({
        leafId: block.id,
        imageIndex,
        label: `${labelPrefix} ${localIndex}`,
        src: block.src,
        alt: block.alt ?? "",
      });
      imageIndex += 1;
    });
  };

  pushImageBlocks("题干图片", data.stemBlocks);

  if (data.questionType === "mc") {
    data.options.forEach((option) => {
      pushImageBlocks(`选项 ${option.label} 图片`, option.blocks);
    });
    pushImageBlocks("答案图片", data.answerBlocks);
  } else if (data.questionType === "frq") {
    pushImageBlocks("参考答案图片", data.sampleAnswerBlocks);
  } else if (data.questionType === "tf") {
    pushImageBlocks("答案图片", data.answerBlocks);
  }

  if ("explanationBlocks" in data) {
    pushImageBlocks("解析图片", data.explanationBlocks);
  }

  return refs;
}

function listContentTargetsFromQuestionInstance(instance: WorksheetBuilderQuestionInstance) {
  const data = instance.block.data;
  const refs: BuilderQuestionContentTargetRef[] = [
    { key: "stem", label: "题干" },
  ];

  if (data.questionType === "mc") {
    data.options.forEach((option) => {
      refs.push({
        key: `option:${option.label}`,
        label: `选项 ${option.label}`,
      });
    });
    refs.push({ key: "answer", label: "答案" });
  } else if (data.questionType === "frq") {
    refs.push({ key: "sampleAnswer", label: "参考答案" });
  } else if (data.questionType === "tf") {
    refs.push({ key: "answer", label: "答案" });
  }

  refs.push({ key: "explanation", label: "解析" });
  return refs;
}

function updateLeafImageInCollection(
  blocks: QuestionContentLeaf[] | null | undefined,
  leafId: string,
  nextImage: { src: string; alt?: string | null } | null,
) {
  let changed = false;
  const nextBlocks = (blocks ?? [])
    .map((block) => {
      if (block.kind !== "image" || block.id !== leafId) {
        return block;
      }

      changed = true;
      if (!nextImage) {
        return null;
      }

      return {
        ...block,
        src: nextImage.src,
        alt: nextImage.alt?.trim() || null,
      };
    })
    .filter((block): block is QuestionContentLeaf => Boolean(block));

  return {
    blocks: nextBlocks,
    changed,
  };
}

function appendLeafToCollection(
  blocks: QuestionContentLeaf[] | null | undefined,
  leaf: QuestionContentLeaf,
) {
  return [...(blocks ?? []), leaf];
}

function buildUpdatedQuestionInstance(
  instance: WorksheetBuilderQuestionInstance,
  nextData: WorksheetBuilderQuestionInstance["block"]["data"],
) {
  const title = instance.originSnapshot.content
    ? buildExerciseTitleFromContent({
        ...instance.originSnapshot.content,
        stem: nextData.stemBlocks ?? instance.originSnapshot.content.stem,
      })
    : instance.title;

  return {
    ...instance,
    title,
    type: resolveQuestionInstanceType(nextData.questionType),
    difficulty: resolveQuestionInstanceDifficulty(instance.difficulty, nextData.difficulty),
    sourceLabel:
      "sourceLabel" in nextData ? nextData.sourceLabel ?? instance.sourceLabel : instance.sourceLabel,
    block: {
      ...instance.block,
      data: nextData,
    },
  } satisfies WorksheetBuilderQuestionInstance;
}

function appendLeafToQuestionInstance(params: {
  instance: WorksheetBuilderQuestionInstance;
  targetKey: string;
  leaf: QuestionContentLeaf;
}) {
  const { instance, targetKey, leaf } = params;
  const data = instance.block.data;

  if (targetKey === "stem") {
    const nextStemBlocks = appendLeafToCollection(data.stemBlocks, leaf);
    return buildUpdatedQuestionInstance(instance, {
      ...data,
      stemBlocks: nextStemBlocks,
      stem: exerciseContentLeavesToMarkdown(nextStemBlocks),
    });
  }

  if (data.questionType === "mc" && targetKey.startsWith("option:")) {
    const targetLabel = targetKey.slice("option:".length);
    const nextOptions = data.options.map((option) =>
      option.label !== targetLabel
        ? option
        : {
            ...option,
            blocks: appendLeafToCollection(option.blocks, leaf),
            text: exerciseContentLeavesToMarkdown(appendLeafToCollection(option.blocks, leaf)),
          },
    );

    return buildUpdatedQuestionInstance(instance, {
      ...data,
      options: nextOptions,
    });
  }

  if (targetKey === "answer" && data.questionType === "mc") {
    const nextAnswerBlocks = appendLeafToCollection(
      data.answerBlocks,
      leaf,
    );
    return buildUpdatedQuestionInstance(instance, {
      ...data,
      answerBlocks: nextAnswerBlocks,
      correctAnswer:
        exerciseContentLeavesToMarkdown(nextAnswerBlocks) || data.correctAnswer,
    });
  }

  if (targetKey === "answer" && data.questionType === "tf") {
    const nextAnswerBlocks = appendLeafToCollection(data.answerBlocks, leaf);
    return buildUpdatedQuestionInstance(instance, {
      ...data,
      answerBlocks: nextAnswerBlocks,
    });
  }

  if (targetKey === "sampleAnswer" && data.questionType === "frq") {
    const nextSampleAnswerBlocks = appendLeafToCollection(data.sampleAnswerBlocks, leaf);
    return buildUpdatedQuestionInstance(instance, {
      ...data,
      sampleAnswerBlocks: nextSampleAnswerBlocks,
      sampleAnswer: exerciseContentLeavesToMarkdown(nextSampleAnswerBlocks) || data.sampleAnswer,
    });
  }

  if (targetKey === "explanation" && "explanationBlocks" in data) {
    const nextExplanationBlocks = appendLeafToCollection(data.explanationBlocks, leaf);
    return buildUpdatedQuestionInstance(instance, {
      ...data,
      explanationBlocks: nextExplanationBlocks,
      explanation: exerciseContentLeavesToMarkdown(nextExplanationBlocks) || data.explanation,
    });
  }

  return instance;
}

export function moveQuestionInBuilderDraft(params: {
  draft: WorksheetBuilderDraft;
  title: string;
  instanceId: string;
  direction: "up" | "down";
}) {
  const parsed = parseQuestionSections(params.draft.html);
  const index = parsed.sections.findIndex((section) => section.instanceId === params.instanceId);
  if (index < 0) return params.draft;
  if (params.direction === "up" && index === 0) return params.draft;
  if (params.direction === "down" && index === parsed.sections.length - 1) return params.draft;

  const nextSections = [...parsed.sections];
  const swapIndex = params.direction === "up" ? index - 1 : index + 1;
  [nextSections[index], nextSections[swapIndex]] = [nextSections[swapIndex], nextSections[index]];
  parsed.sections = renumberSections(nextSections);

  return rebuildDraftFromSections({
    currentDraft: params.draft,
    html: serializeQuestionSections(parsed),
    title: params.title,
  });
}

export function deleteQuestionFromBuilderDraft(params: {
  draft: WorksheetBuilderDraft;
  title: string;
  instanceId: string;
}) {
  const parsed = parseQuestionSections(params.draft.html);
  const nextSections = parsed.sections.filter((section) => section.instanceId !== params.instanceId);
  if (nextSections.length === parsed.sections.length) return params.draft;
  parsed.sections = renumberSections(nextSections);

  return rebuildDraftFromSections({
    currentDraft: params.draft,
    html: serializeQuestionSections(parsed),
    title: params.title,
  });
}

export function duplicateQuestionInBuilderDraft(params: {
  draft: WorksheetBuilderDraft;
  title: string;
  instanceId: string;
}) {
  const parsed = parseQuestionSections(params.draft.html);
  const index = parsed.sections.findIndex((section) => section.instanceId === params.instanceId);
  if (index < 0) return params.draft;

  const nextSections = [...parsed.sections];
  const target = nextSections[index];
  const duplicated = cloneSection({
    ...target,
    trailingGap: "",
  });

  nextSections[index] = {
    ...target,
    trailingGap: "",
  };
  nextSections.splice(index + 1, 0, {
    ...duplicated,
    trailingGap: target.trailingGap,
  });

  parsed.sections = renumberSections(nextSections);

  return rebuildDraftFromSections({
    currentDraft: params.draft,
    html: serializeQuestionSections(parsed),
    title: params.title,
  });
}

export function insertBlankQuestionInBuilderDraft(params: {
  draft: WorksheetBuilderDraft;
  title: string;
  questionType?: BuilderManualQuestionType;
  mode?: BuilderInsertionMode;
  referenceInstanceId?: string | null;
}) {
  const parsed = parseQuestionSections(params.draft.html);
  const nextSection = createBlankQuestionSection(
    parsed.sections.length + 1,
    params.questionType ?? "fill",
  );
  const nextSections = [...parsed.sections];
  const referenceInstanceId = params.referenceInstanceId?.trim() || null;

  if (nextSections.length === 0) {
    nextSections.push(nextSection);
  } else if (params.mode === "before-active" && referenceInstanceId) {
    const index = findQuestionSection(parsed, referenceInstanceId);
    if (index >= 0) {
      nextSections.splice(index, 0, nextSection);
    } else {
      nextSections.push(nextSection);
    }
  } else if (params.mode === "after-active" && referenceInstanceId) {
    const index = findQuestionSection(parsed, referenceInstanceId);
    if (index >= 0) {
      const target = nextSections[index];
      const trailingGap = target?.trailingGap ?? "";
      nextSections[index] = {
        ...target,
        trailingGap: "",
      };
      nextSections.splice(index + 1, 0, {
        ...nextSection,
        trailingGap,
      });
    } else {
      nextSections.push(nextSection);
    }
  } else {
    nextSections.push(nextSection);
  }

  parsed.sections = renumberSections(nextSections);

  return {
    draft: rebuildDraftFromSections({
      currentDraft: params.draft,
      html: serializeQuestionSections(parsed),
      title: params.title,
    }),
    insertedInstanceId: nextSection.instanceId,
  };
}

export function getQuestionSectionHtmlInBuilderDraft(params: {
  draft: WorksheetBuilderDraft;
  instanceId: string;
}) {
  const parsed = parseQuestionSections(params.draft.html);
  const index = findQuestionSection(parsed, params.instanceId);
  if (index < 0) return null;
  return parsed.sections[index]?.sectionHtml ?? null;
}

export function replaceQuestionSectionInBuilderDraft(params: {
  draft: WorksheetBuilderDraft;
  title: string;
  instanceId: string;
  sectionHtml: string;
}) {
  const parsed = parseQuestionSections(params.draft.html);
  const index = findQuestionSection(parsed, params.instanceId);
  if (index < 0) return params.draft;

  const currentSection = parsed.sections[index];
  if (!currentSection) return params.draft;

  const nextSections = [...parsed.sections];
  nextSections[index] = {
    ...currentSection,
    sectionHtml: normalizeQuestionSectionReplacement({
      originalSectionHtml: currentSection.sectionHtml,
      replacementHtml: params.sectionHtml,
    }),
  };
  parsed.sections = renumberSections(nextSections);

  return rebuildDraftFromSections({
    currentDraft: params.draft,
    html: serializeQuestionSections(parsed),
    title: params.title,
  });
}

export function listQuestionImagesInBuilderDraft(params: {
  draft: WorksheetBuilderDraft;
  instanceId: string;
}) {
  const instance = params.draft.questionInstances.find(
    (item) => item.instanceId === params.instanceId,
  );
  if (instance) {
    const refs = listImageBlocksFromQuestionInstance(instance);
    if (refs.length > 0) {
      return refs;
    }
  }

  const parsed = parseQuestionSections(params.draft.html);
  const index = findQuestionSection(parsed, params.instanceId);
  if (index < 0) return [] as BuilderQuestionImageRef[];

  return readImageRefsFromSection(parsed.sections[index]!.sectionHtml);
}

export function listQuestionTextBlocksInBuilderDraft(params: {
  draft: WorksheetBuilderDraft;
  instanceId: string;
}) {
  const instance = params.draft.questionInstances.find(
    (item) => item.instanceId === params.instanceId,
  );
  if (!instance) return [] as BuilderQuestionTextBlockRef[];
  return listTextBlocksFromQuestionInstance(instance);
}

export function listQuestionContentTargetsInBuilderDraft(params: {
  draft: WorksheetBuilderDraft;
  instanceId: string;
}) {
  const instance = params.draft.questionInstances.find(
    (item) => item.instanceId === params.instanceId,
  );
  if (!instance) return [] as BuilderQuestionContentTargetRef[];
  return listContentTargetsFromQuestionInstance(instance);
}

export function insertQuestionTextBlockInBuilderDraft(params: {
  draft: WorksheetBuilderDraft;
  title: string;
  instanceId: string;
  targetKey: string;
  text: string;
}) {
  const nextInstances = params.draft.questionInstances.map((instance) =>
    instance.instanceId !== params.instanceId
      ? instance
      : appendLeafToQuestionInstance({
          instance,
          targetKey: params.targetKey,
          leaf: {
            id: crypto.randomUUID(),
            kind: "text",
            text: params.text,
          },
        }),
  );

  const changed = nextInstances.some(
    (instance, index) => instance !== params.draft.questionInstances[index],
  );
  if (!changed) return params.draft;

  return rebuildDraftFromQuestionInstances({
    currentDraft: params.draft,
    title: params.title,
    questionInstances: nextInstances,
  });
}

export function updateQuestionDifficultyInBuilderDraft(params: {
  draft: WorksheetBuilderDraft;
  title: string;
  instanceId: string;
  difficulty: ExerciseDifficulty;
}) {
  const nextInstances = params.draft.questionInstances.map((instance) =>
    instance.instanceId !== params.instanceId
      ? instance
      : buildUpdatedQuestionInstance(instance, {
          ...instance.block.data,
          difficulty: params.difficulty,
        }),
  );

  const changed = nextInstances.some(
    (instance, index) => instance !== params.draft.questionInstances[index],
  );
  if (!changed) return params.draft;

  return rebuildDraftFromQuestionInstances({
    currentDraft: params.draft,
    title: params.title,
    questionInstances: nextInstances,
  });
}

export function convertQuestionTypeInBuilderDraft(params: {
  draft: WorksheetBuilderDraft;
  title: string;
  instanceId: string;
  questionType: BuilderManualQuestionType;
}) {
  const nextInstances = params.draft.questionInstances.map((instance) => {
    if (instance.instanceId !== params.instanceId) {
      return instance;
    }

    const currentData = instance.block.data;
    if (currentData.questionType === params.questionType) {
      return instance;
    }

    const baseData = {
      instanceId: currentData.instanceId,
      sourceExerciseId: currentData.sourceExerciseId,
      number: currentData.number,
      stem: currentData.stem,
      stemBlocks: currentData.stemBlocks,
      points: currentData.points,
      difficulty: currentData.difficulty,
      sourceLabel: currentData.sourceLabel ?? null,
    };
    const explanationText =
      "explanation" in currentData ? currentData.explanation ?? null : null;
    const explanationBlocks =
      "explanationBlocks" in currentData ? currentData.explanationBlocks ?? null : null;

    if (params.questionType === "mc") {
      const nextOptions =
        currentData.questionType === "mc" && currentData.options.length > 0
          ? currentData.options
          : createDefaultMcOptions();
      const correctAnswer =
        currentData.questionType === "mc"
          ? currentData.correctAnswer?.trim() || "A"
          : "A";

      return buildUpdatedQuestionInstance(instance, {
        ...baseData,
        questionType: "mc",
        options: nextOptions,
        correctAnswer,
        answerBlocks: syncTextLeafInCollection(
          currentData.questionType === "mc" ? currentData.answerBlocks : null,
          correctAnswer,
        ),
        explanation: explanationText,
        explanationBlocks,
      });
    }

    if (params.questionType === "frq") {
      const sampleAnswer = readQuestionAnswerText(instance) || "在这里输入参考答案";
      return buildUpdatedQuestionInstance(instance, {
        ...baseData,
        questionType: "frq",
        answerSpace: "medium",
        sampleAnswer,
        sampleAnswerBlocks: readQuestionAnswerBlocks(instance),
        explanation: explanationText,
        explanationBlocks,
      });
    }

    if (params.questionType === "tf") {
      const truthy = readQuestionAnswerText(instance).toLowerCase();
      const correctAnswer = truthy !== "false";
      return buildUpdatedQuestionInstance(instance, {
        ...baseData,
        questionType: "tf",
        correctAnswer,
        answerBlocks: syncTextLeafInCollection(
          currentData.questionType === "tf" ? currentData.answerBlocks : null,
          correctAnswer ? "True" : "False",
        ),
        explanation: explanationText,
        explanationBlocks,
      });
    }

    return buildUpdatedQuestionInstance(instance, {
      ...baseData,
      questionType: "fill",
      blanks:
        currentData.questionType === "fill"
          ? currentData.blanks
          : [{ position: 0, answer: null }],
      explanation: explanationText,
      explanationBlocks,
    });
  });

  const changed = nextInstances.some(
    (instance, index) => instance !== params.draft.questionInstances[index],
  );
  if (!changed) return params.draft;

  return rebuildDraftFromQuestionInstances({
    currentDraft: params.draft,
    title: params.title,
    questionInstances: nextInstances,
  });
}

export function updateFrqAnswerSpaceInBuilderDraft(params: {
  draft: WorksheetBuilderDraft;
  title: string;
  instanceId: string;
  answerSpace: "small" | "medium" | "large";
}) {
  const nextInstances = params.draft.questionInstances.map((instance) => {
    if (instance.instanceId !== params.instanceId || instance.block.data.questionType !== "frq") {
      return instance;
    }

    return buildUpdatedQuestionInstance(instance, {
      ...instance.block.data,
      answerSpace: params.answerSpace,
    });
  });

  const changed = nextInstances.some(
    (instance, index) => instance !== params.draft.questionInstances[index],
  );
  if (!changed) return params.draft;

  return rebuildDraftFromQuestionInstances({
    currentDraft: params.draft,
    title: params.title,
    questionInstances: nextInstances,
  });
}

export function setTfCorrectAnswerInBuilderDraft(params: {
  draft: WorksheetBuilderDraft;
  title: string;
  instanceId: string;
  correctAnswer: boolean;
}) {
  const nextInstances = params.draft.questionInstances.map((instance) => {
    if (instance.instanceId !== params.instanceId || instance.block.data.questionType !== "tf") {
      return instance;
    }

    return buildUpdatedQuestionInstance(instance, {
      ...instance.block.data,
      correctAnswer: params.correctAnswer,
      answerBlocks: syncTextLeafInCollection(
        instance.block.data.answerBlocks,
        params.correctAnswer ? "True" : "False",
      ),
    });
  });

  const changed = nextInstances.some(
    (instance, index) => instance !== params.draft.questionInstances[index],
  );
  if (!changed) return params.draft;

  return rebuildDraftFromQuestionInstances({
    currentDraft: params.draft,
    title: params.title,
    questionInstances: nextInstances,
  });
}

export function setMcCorrectOptionInBuilderDraft(params: {
  draft: WorksheetBuilderDraft;
  title: string;
  instanceId: string;
  correctLabel: string;
}) {
  const nextInstances = params.draft.questionInstances.map((instance) => {
    if (instance.instanceId !== params.instanceId || instance.block.data.questionType !== "mc") {
      return instance;
    }

    const nextOptions = instance.block.data.options.map((option) => ({
      ...option,
      isCorrect: option.label === params.correctLabel,
    }));

    return buildUpdatedQuestionInstance(instance, {
      ...instance.block.data,
      options: nextOptions,
      correctAnswer: params.correctLabel,
      answerBlocks: syncTextLeafInCollection(instance.block.data.answerBlocks, params.correctLabel),
    });
  });

  const changed = nextInstances.some(
    (instance, index) => instance !== params.draft.questionInstances[index],
  );
  if (!changed) return params.draft;

  return rebuildDraftFromQuestionInstances({
    currentDraft: params.draft,
    title: params.title,
    questionInstances: nextInstances,
  });
}

export function addMcOptionInBuilderDraft(params: {
  draft: WorksheetBuilderDraft;
  title: string;
  instanceId: string;
}) {
  const nextInstances = params.draft.questionInstances.map((instance) => {
    if (instance.instanceId !== params.instanceId || instance.block.data.questionType !== "mc") {
      return instance;
    }

    const nextLabel = getOptionLabelByIndex(instance.block.data.options.length);
    const nextOptions = [
      ...instance.block.data.options,
      {
        label: nextLabel,
        text: `新增选项 ${nextLabel}`,
        blocks: [
          {
            id: crypto.randomUUID(),
            kind: "text" as const,
            text: `新增选项 ${nextLabel}`,
          },
        ] satisfies QuestionContentLeaf[],
        isCorrect: false,
      },
    ];

    return buildUpdatedQuestionInstance(instance, {
      ...instance.block.data,
      options: nextOptions,
    });
  });

  const changed = nextInstances.some(
    (instance, index) => instance !== params.draft.questionInstances[index],
  );
  if (!changed) return params.draft;

  return rebuildDraftFromQuestionInstances({
    currentDraft: params.draft,
    title: params.title,
    questionInstances: nextInstances,
  });
}

export function removeMcOptionInBuilderDraft(params: {
  draft: WorksheetBuilderDraft;
  title: string;
  instanceId: string;
  optionLabel: string;
}) {
  const nextInstances = params.draft.questionInstances.map((instance) => {
    if (instance.instanceId !== params.instanceId || instance.block.data.questionType !== "mc") {
      return instance;
    }

    if (instance.block.data.options.length <= 2) {
      return instance;
    }

    const remaining = instance.block.data.options.filter(
      (option) => option.label !== params.optionLabel,
    );
    if (remaining.length === instance.block.data.options.length) {
      return instance;
    }

    const nextOptions = remaining.map((option, index) => {
      const nextLabel = getOptionLabelByIndex(index);
      return {
        ...option,
        label: nextLabel,
      };
    });

    const previousCorrect = instance.block.data.correctAnswer?.trim() || null;
    const labelMap = new Map(
      remaining.map((option, index) => [option.label, getOptionLabelByIndex(index)]),
    );
    const fallbackCorrectOption =
      nextOptions.find((option) => option.isCorrect)?.label ??
      nextOptions[0]?.label ??
      null;
    const relabeledCorrectOption =
      (previousCorrect ? labelMap.get(previousCorrect) ?? null : null) ??
      fallbackCorrectOption;

    const correctedOptions = nextOptions.map((option) => ({
      ...option,
      isCorrect: option.label === relabeledCorrectOption,
    }));

    return buildUpdatedQuestionInstance(instance, {
      ...instance.block.data,
      options: correctedOptions,
      correctAnswer: relabeledCorrectOption,
      answerBlocks: relabeledCorrectOption
        ? syncTextLeafInCollection(instance.block.data.answerBlocks, relabeledCorrectOption)
        : instance.block.data.answerBlocks,
    });
  });

  const changed = nextInstances.some(
    (instance, index) => instance !== params.draft.questionInstances[index],
  );
  if (!changed) return params.draft;

  return rebuildDraftFromQuestionInstances({
    currentDraft: params.draft,
    title: params.title,
    questionInstances: nextInstances,
  });
}

export function updateQuestionTextBlockInBuilderDraft(params: {
  draft: WorksheetBuilderDraft;
  title: string;
  instanceId: string;
  leafId: string;
  text: string;
}) {
  const nextInstances = params.draft.questionInstances.map((instance) => {
    if (instance.instanceId !== params.instanceId) {
      return instance;
    }

    const data = instance.block.data;
    let nextData = { ...data };
    let didChange = false;

    const stemUpdate = updateLeafTextInCollection(
      data.stemBlocks,
      params.leafId,
      params.text,
    );
    if (stemUpdate.changed) {
      didChange = true;
      nextData = {
        ...nextData,
        stemBlocks: stemUpdate.blocks,
      };
    }

    if (data.questionType === "mc") {
      const nextOptions = data.options.map((option) => {
        const optionUpdate = updateLeafTextInCollection(
          option.blocks,
          params.leafId,
          params.text,
        );
        if (!optionUpdate.changed) return option;
        didChange = true;
        return {
          ...option,
          blocks: optionUpdate.blocks,
          text: optionUpdate.blocks
            .filter((block) => block.kind === "text")
            .map((block) => block.text)
            .join(" ")
            .trim(),
        };
      });
      const mcData: typeof data = {
        ...(nextData as typeof data),
        options: nextOptions,
      };
      nextData = mcData;

      const answerUpdate = updateLeafTextInCollection(
        data.answerBlocks,
        params.leafId,
        params.text,
      );
      if (answerUpdate.changed) {
        didChange = true;
        const nextCorrectAnswer =
          answerUpdate.blocks
            .filter((block): block is Extract<QuestionContentLeaf, { kind: "text" }> => block.kind === "text")
            .map((block) => block.text)
            .join(" ")
            .trim() || data.correctAnswer;
        const updatedMcData: typeof data = {
          ...(nextData as typeof data),
          answerBlocks: answerUpdate.blocks,
          correctAnswer: nextCorrectAnswer,
        };
        nextData = updatedMcData;
      }
    } else if (data.questionType === "frq") {
      const sampleAnswerUpdate = updateLeafTextInCollection(
        data.sampleAnswerBlocks,
        params.leafId,
        params.text,
      );
      if (sampleAnswerUpdate.changed) {
        didChange = true;
        const nextSampleAnswer =
          sampleAnswerUpdate.blocks
            .filter((block): block is Extract<QuestionContentLeaf, { kind: "text" }> => block.kind === "text")
            .map((block) => block.text)
            .join(" ")
            .trim() || data.sampleAnswer;
        const updatedFrqData: typeof data = {
          ...(nextData as typeof data),
          sampleAnswerBlocks: sampleAnswerUpdate.blocks,
          sampleAnswer: nextSampleAnswer,
        };
        nextData = updatedFrqData;
      }
    } else if (data.questionType === "tf") {
      const answerUpdate = updateLeafTextInCollection(
        data.answerBlocks,
        params.leafId,
        params.text,
      );
      if (answerUpdate.changed) {
        didChange = true;
        const updatedTfData: typeof data = {
          ...(nextData as typeof data),
          answerBlocks: answerUpdate.blocks,
        };
        nextData = updatedTfData;
      }
    }

    const explanationUpdate = updateLeafTextInCollection(
      "explanationBlocks" in data ? data.explanationBlocks : null,
      params.leafId,
      params.text,
    );
    if (explanationUpdate.changed) {
      didChange = true;
      nextData = {
        ...nextData,
        explanationBlocks: explanationUpdate.blocks,
        explanation:
          explanationUpdate.blocks
            .filter((block): block is Extract<QuestionContentLeaf, { kind: "text" }> => block.kind === "text")
            .map((block) => block.text)
            .join(" ")
            .trim() || ("explanation" in data ? data.explanation : null),
      };
    }

    if (!didChange) return instance;

    const stemText = (nextData.stemBlocks ?? [])
      .filter((block): block is Extract<QuestionContentLeaf, { kind: "text" }> => block.kind === "text")
      .map((block) => block.text)
      .join(" ")
      .trim();
    nextData = {
      ...nextData,
      stem: stemText || nextData.stem,
    };

    const title = instance.originSnapshot.content
      ? buildExerciseTitleFromContent({
          ...instance.originSnapshot.content,
          stem: nextData.stemBlocks ?? instance.originSnapshot.content.stem,
        })
      : instance.title;

    return {
      ...instance,
      title,
      block: {
        ...instance.block,
        data: nextData,
      },
    } satisfies WorksheetBuilderQuestionInstance;
  });

  const changed = nextInstances.some(
    (instance, index) => instance !== params.draft.questionInstances[index],
  );
  if (!changed) return params.draft;

  return rebuildDraftFromQuestionInstances({
    currentDraft: params.draft,
    title: params.title,
    questionInstances: nextInstances,
  });
}

export function replaceQuestionImageInBuilderDraft(params: {
  draft: WorksheetBuilderDraft;
  title: string;
  instanceId: string;
  imageIndex: number;
  src: string;
  alt?: string | null;
}) {
  const nextInstances = params.draft.questionInstances.map((instance) => {
    if (instance.instanceId !== params.instanceId) {
      return instance;
    }

    const imageRef = listImageBlocksFromQuestionInstance(instance)[params.imageIndex];
    if (!imageRef) {
      return instance;
    }

    const data = instance.block.data;
    let nextData = { ...data };
    let didChange = false;

    const stemUpdate = updateLeafImageInCollection(data.stemBlocks, imageRef.leafId, {
      src: params.src,
      alt: params.alt,
    });
    if (stemUpdate.changed) {
      didChange = true;
      nextData = {
        ...nextData,
        stemBlocks: stemUpdate.blocks,
        stem: exerciseContentLeavesToMarkdown(stemUpdate.blocks),
      };
    }

    if (data.questionType === "mc") {
      const nextOptions = data.options.map((option) => {
        const optionUpdate = updateLeafImageInCollection(option.blocks, imageRef.leafId, {
          src: params.src,
          alt: params.alt,
        });
        if (!optionUpdate.changed) return option;
        didChange = true;
        return {
          ...option,
          blocks: optionUpdate.blocks,
          text: exerciseContentLeavesToMarkdown(optionUpdate.blocks),
        };
      });
      const answerUpdate = updateLeafImageInCollection(data.answerBlocks, imageRef.leafId, {
        src: params.src,
        alt: params.alt,
      });

      const updatedMcData: typeof data = {
        ...(nextData as typeof data),
        options: nextOptions,
        answerBlocks: answerUpdate.changed ? answerUpdate.blocks : data.answerBlocks,
        correctAnswer: answerUpdate.changed
          ? exerciseContentLeavesToMarkdown(answerUpdate.blocks) || data.correctAnswer
          : data.correctAnswer,
      };
      nextData = updatedMcData;
      didChange ||= answerUpdate.changed;
    } else if (data.questionType === "frq") {
      const sampleAnswerUpdate = updateLeafImageInCollection(
        data.sampleAnswerBlocks,
        imageRef.leafId,
        {
          src: params.src,
          alt: params.alt,
        },
      );
      if (sampleAnswerUpdate.changed) {
        didChange = true;
        const updatedFrqData: typeof data = {
          ...(nextData as typeof data),
          sampleAnswerBlocks: sampleAnswerUpdate.blocks,
          sampleAnswer:
            exerciseContentLeavesToMarkdown(sampleAnswerUpdate.blocks) || data.sampleAnswer,
        };
        nextData = updatedFrqData;
      }
    } else if (data.questionType === "tf") {
      const answerUpdate = updateLeafImageInCollection(data.answerBlocks, imageRef.leafId, {
        src: params.src,
        alt: params.alt,
      });
      if (answerUpdate.changed) {
        didChange = true;
        const updatedTfData: typeof data = {
          ...(nextData as typeof data),
          answerBlocks: answerUpdate.blocks,
        };
        nextData = updatedTfData;
      }
    }

    if ("explanationBlocks" in data) {
      const explanationUpdate = updateLeafImageInCollection(
        data.explanationBlocks,
        imageRef.leafId,
        {
          src: params.src,
          alt: params.alt,
        },
      );
      if (explanationUpdate.changed) {
        didChange = true;
        nextData = {
          ...(nextData as typeof nextData),
          explanationBlocks: explanationUpdate.blocks,
          explanation:
            exerciseContentLeavesToMarkdown(explanationUpdate.blocks) || data.explanation,
        };
      }
    }

    if (!didChange) {
      return instance;
    }

    const title = instance.originSnapshot.content
      ? buildExerciseTitleFromContent({
          ...instance.originSnapshot.content,
          stem: nextData.stemBlocks ?? instance.originSnapshot.content.stem,
        })
      : instance.title;

    return {
      ...instance,
      title,
      block: {
        ...instance.block,
        data: nextData,
      },
    } satisfies WorksheetBuilderQuestionInstance;
  });

  const changed = nextInstances.some(
    (instance, index) => instance !== params.draft.questionInstances[index],
  );
  if (!changed) return params.draft;

  return rebuildDraftFromQuestionInstances({
    currentDraft: params.draft,
    title: params.title,
    questionInstances: nextInstances,
  });
}

export function removeQuestionImageFromBuilderDraft(params: {
  draft: WorksheetBuilderDraft;
  title: string;
  instanceId: string;
  imageIndex: number;
}) {
  const nextInstances = params.draft.questionInstances.map((instance) => {
    if (instance.instanceId !== params.instanceId) {
      return instance;
    }

    const imageRef = listImageBlocksFromQuestionInstance(instance)[params.imageIndex];
    if (!imageRef) {
      return instance;
    }

    const data = instance.block.data;
    let nextData = { ...data };
    let didChange = false;

    const stemUpdate = updateLeafImageInCollection(data.stemBlocks, imageRef.leafId, null);
    if (stemUpdate.changed) {
      didChange = true;
      nextData = {
        ...nextData,
        stemBlocks: stemUpdate.blocks,
        stem: exerciseContentLeavesToMarkdown(stemUpdate.blocks),
      };
    }

    if (data.questionType === "mc") {
      const nextOptions = data.options.map((option) => {
        const optionUpdate = updateLeafImageInCollection(option.blocks, imageRef.leafId, null);
        if (!optionUpdate.changed) return option;
        didChange = true;
        return {
          ...option,
          blocks: optionUpdate.blocks,
          text: exerciseContentLeavesToMarkdown(optionUpdate.blocks),
        };
      });
      const answerUpdate = updateLeafImageInCollection(data.answerBlocks, imageRef.leafId, null);

      const updatedMcData: typeof data = {
        ...(nextData as typeof data),
        options: nextOptions,
        answerBlocks: answerUpdate.changed ? answerUpdate.blocks : data.answerBlocks,
        correctAnswer: answerUpdate.changed
          ? exerciseContentLeavesToMarkdown(answerUpdate.blocks) || data.correctAnswer
          : data.correctAnswer,
      };
      nextData = updatedMcData;
      didChange ||= answerUpdate.changed;
    } else if (data.questionType === "frq") {
      const sampleAnswerUpdate = updateLeafImageInCollection(
        data.sampleAnswerBlocks,
        imageRef.leafId,
        null,
      );
      if (sampleAnswerUpdate.changed) {
        didChange = true;
        const updatedFrqData: typeof data = {
          ...(nextData as typeof data),
          sampleAnswerBlocks: sampleAnswerUpdate.blocks,
          sampleAnswer:
            exerciseContentLeavesToMarkdown(sampleAnswerUpdate.blocks) || data.sampleAnswer,
        };
        nextData = updatedFrqData;
      }
    } else if (data.questionType === "tf") {
      const answerUpdate = updateLeafImageInCollection(data.answerBlocks, imageRef.leafId, null);
      if (answerUpdate.changed) {
        didChange = true;
        const updatedTfData: typeof data = {
          ...(nextData as typeof data),
          answerBlocks: answerUpdate.blocks,
        };
        nextData = updatedTfData;
      }
    }

    if ("explanationBlocks" in data) {
      const explanationUpdate = updateLeafImageInCollection(
        data.explanationBlocks,
        imageRef.leafId,
        null,
      );
      if (explanationUpdate.changed) {
        didChange = true;
        nextData = {
          ...(nextData as typeof nextData),
          explanationBlocks: explanationUpdate.blocks,
          explanation:
            exerciseContentLeavesToMarkdown(explanationUpdate.blocks) || data.explanation,
        };
      }
    }

    if (!didChange) {
      return instance;
    }

    const title = instance.originSnapshot.content
      ? buildExerciseTitleFromContent({
          ...instance.originSnapshot.content,
          stem: nextData.stemBlocks ?? instance.originSnapshot.content.stem,
        })
      : instance.title;

    return {
      ...instance,
      title,
      block: {
        ...instance.block,
        data: nextData,
      },
    } satisfies WorksheetBuilderQuestionInstance;
  });

  const changed = nextInstances.some(
    (instance, index) => instance !== params.draft.questionInstances[index],
  );
  if (!changed) return params.draft;

  return rebuildDraftFromQuestionInstances({
    currentDraft: params.draft,
    title: params.title,
    questionInstances: nextInstances,
  });
}

export function insertQuestionImageInBuilderDraft(params: {
  draft: WorksheetBuilderDraft;
  title: string;
  instanceId: string;
  src: string;
  alt?: string | null;
  targetKey?: string;
}) {
  const nextInstances = params.draft.questionInstances.map((instance) => {
    if (instance.instanceId !== params.instanceId) {
      return instance;
    }

    return appendLeafToQuestionInstance({
      instance,
      targetKey: params.targetKey ?? "stem",
      leaf: {
        id: crypto.randomUUID(),
        kind: "image",
        src: params.src,
        alt: params.alt?.trim() || "题目图片",
      },
    });
  });

  const changed = nextInstances.some(
    (instance, index) => instance !== params.draft.questionInstances[index],
  );
  if (!changed) return params.draft;

  return rebuildDraftFromQuestionInstances({
    currentDraft: params.draft,
    title: params.title,
    questionInstances: nextInstances,
  });
}
