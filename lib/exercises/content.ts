import { z } from "zod";
import {
  normalizeMathText,
  repairBrokenInlineMathDelimiters,
  repairExplicitMathLatex,
  restoreMathTagMarkupToLatex,
} from "@/lib/doc-engine/math-core";
import type {
  ExerciseContent,
  ExerciseContentLeaf,
  ExerciseContentOption,
  ExerciseOption,
  ExerciseType,
} from "@/types/exercise";

const MARKDOWN_IMAGE_PATTERN = /!\[([^\]]*)\]\(([^)]+)\)/g;
const EXPLICIT_LATEX_DELIMITER_PATTERN =
  /\$\$[\s\S]+?\$\$|(?<!\$)\$[^\n$]+?\$(?!\$)|\\\([\s\S]+?\\\)|\\\[[\s\S]+?\\\]/;
const EXPLICIT_LATEX_DELIMITER_GLOBAL_PATTERN =
  /\$\$[\s\S]+?\$\$|(?<!\$)\$[^\n$]+?\$(?!\$)|\\\([\s\S]+?\\\)|\\\[[\s\S]+?\\\]/g;
const ESCAPED_INLINE_DELIMITER_PATTERN = /\\\$([^\n$]+?)\\\$/g;
const INLINE_FORMULA_PROMPT_PATTERN = /^(?<!\$)\$([^\n$]+?)\$(?!\$)\s*([=:?])\s*$/;

function repairDelimitedMathMarkup(value: string) {
  return value
    .replace(ESCAPED_INLINE_DELIMITER_PATTERN, (match, latex: string) => {
      if (!latex.trim()) return match;
      return `$${repairExplicitMathLatex(latex)}$`;
    })
    .replace(/\$\$([\s\S]+?)\$\$/g, (_match, latex: string) => `$$${repairExplicitMathLatex(latex)}$$`)
    .replace(/(?<!\$)\$([^\n$]+?)\$(?!\$)/g, (_match, latex: string) => `$${repairExplicitMathLatex(latex)}$`)
    .replace(/\\\(([\s\S]+?)\\\)/g, (_match, latex: string) => `\\(${repairExplicitMathLatex(latex)}\\)`)
    .replace(/\\\[([\s\S]+?)\\\]/g, (_match, latex: string) => `\\[${repairExplicitMathLatex(latex)}\\]`);
}

function hasMixedPlainTextMathOutsideExplicitDelimiters(value: string) {
  const outsideExplicitMath = value
    .replace(EXPLICIT_LATEX_DELIMITER_GLOBAL_PATTERN, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!outsideExplicitMath) return false;

  return (
    /[∑∏ΣΠ∞πθλμΩΔΦΓαβγδεζηικλμνξρστυφχψω·⋯]/.test(outsideExplicitMath) ||
    /\.\.\./.test(outsideExplicitMath) ||
    /\b(?:sqrt|sin|cos|tan|sec|csc|cot|log|ln|lim)\s*\(/.test(
      outsideExplicitMath,
    ) ||
    /\blim\b(?=\s+(?:[A-Za-z](?:\([^)]*\))?|\[[^\]]+\]|[A-Za-z]\s*(?:→|\\to)))/.test(
      outsideExplicitMath,
    ) ||
    /(?:^|[\s)])=\s*[A-Za-z0-9(]+\/[A-Za-z0-9(]/.test(outsideExplicitMath) ||
    /[A-Za-z0-9)}]\^[A-Za-z0-9{(]/.test(outsideExplicitMath) ||
    /[A-Za-z0-9)}]!/.test(outsideExplicitMath)
  );
}

function shouldMergeStoredInlineLatex(leftLatex: string, rightLatex: string) {
  const left = leftLatex.trim();
  const right = rightLatex.trim();
  if (!left || !right) return false;

  if (/^(?:[=+\-−]|\\(?:geq|leq|approx|cdot|to)\b)/.test(right)) {
    return true;
  }

  if (!/[=^_!\/∑∏ΣΠ∞π·\\]/.test(right) && !/\.\.\.|\\cdots/.test(right)) {
    return false;
  }

  const longWords = right.match(/[A-Za-z]{3,}/g) ?? [];
  return longWords.every((word) =>
    ["sin", "cos", "tan", "log", "ln", "lim", "exp", "max", "min"].includes(
      word.toLowerCase(),
    ),
  );
}

function mergeAdjacentStoredInlineLatex(value: string) {
  let current = value;
  let changed = false;

  do {
    changed = false;
    current = current.replace(
      /\$([^\n$]+?)\$\s+\$([^\n$]+?)\$/g,
      (match, leftLatex: string, rightLatex: string) => {
        if (!shouldMergeStoredInlineLatex(leftLatex, rightLatex)) {
          return match;
        }

        changed = true;
        return `$${leftLatex.trim()} ${rightLatex.trim()}$`;
      },
    );
  } while (changed);

  return current;
}

function isLikelyStoredMathContinuationTail(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (trimmed === "!" || trimmed === "\\cdots" || trimmed === "..." || trimmed === "⋯") {
    return true;
  }
  if (/[\u4e00-\u9fff]/.test(trimmed)) {
    return false;
  }
  if (
    !/[0-9A-Za-z()]/.test(trimmed) ||
    (!/[=^_!\/∑∏ΣΠ∞π·⋯+\-−\\]/.test(trimmed) && !/\.\.\.|\\cdots/.test(trimmed))
  ) {
    return false;
  }

  const longWords = trimmed.match(/[A-Za-z]{3,}/g) ?? [];
  return longWords.every((word) =>
    [
      "sin",
      "cos",
      "tan",
      "log",
      "ln",
      "lim",
      "exp",
      "max",
      "min",
      "alpha",
      "beta",
      "gamma",
      "delta",
      "epsilon",
      "zeta",
      "eta",
      "theta",
      "kappa",
      "lambda",
      "mu",
      "nu",
      "xi",
      "pi",
      "rho",
      "sigma",
      "tau",
      "phi",
      "chi",
      "psi",
      "omega",
      "left",
      "right",
      "tot",
    ].includes(word.toLowerCase()),
  );
}

function extractLeadingStoredMathContinuation(value: string) {
  const source = value ?? "";
  const leadingWhitespace = source.match(/^\s*/)?.[0] ?? "";
  const trimmedStart = source.slice(leadingWhitespace.length);
  const boundaries = [
    /\s+\b(?:for|if|when|where|because|thus|therefore|while|since|What|Which|That|This|is|are|was|were|converges|diverges)\b/,
    /[?;\n]/,
  ];
  let boundary = trimmedStart.length;

  boundaries.forEach((pattern) => {
    const match = trimmedStart.match(pattern);
    if (match && typeof match.index === "number") {
      boundary = Math.min(boundary, match.index);
    }
  });

  const candidate = trimmedStart
    .slice(0, boundary)
    .replace(/\s+$/g, "")
    .replace(/(?<!\.)\.(?!\.)$/g, "");
  const remainder = trimmedStart.slice(boundary);

  return {
    candidate,
    remainder,
  };
}

function repairSplitStoredDelimitedSumProductExpressions(value: string) {
  if (!value || !/[∑∏ΣΠ]/.test(value) || !value.includes("$")) {
    return value;
  }

  return value.replace(
    /([∑∏ΣΠ])\s*\(\s*([A-Za-z])\s*=\s*([^()$\n]+?)\s*(?:\\to|to|→)\s*\$([^$]*?)\)\s*([^$]+?)\$/g,
    (
      match,
      operator: string,
      variable: string,
      start: string,
      end: string,
      body: string,
    ) => {
      const normalizedEnd = repairExplicitMathLatex(end.trim());
      const normalizedBody = repairExplicitMathLatex(body.trim());
      if (!normalizedEnd || !normalizedBody) {
        return match;
      }

      const command =
        operator === "∏" || operator === "Π" ? "\\prod" : "\\sum";
      return `$${command}_{${variable}=${repairExplicitMathLatex(
        start.trim(),
      )}}^{${normalizedEnd}} ${normalizedBody}$`;
    },
  );
}

function foldStoredInlineMathContinuationTails(value: string) {
  let current = value;
  let changed = false;

  do {
    changed = false;
    current = current.replace(
      /\$([^\n$]+?)\$(?!\$)([^$\n<]+)/g,
      (match, latex: string, trailingText: string) => {
        const normalizedLatex = repairExplicitMathLatex(latex);

        const factorialTailMatch = trailingText.match(/^(\s*)(!)([\s\S]*)$/);
        if (factorialTailMatch) {
          const leadingWhitespace = factorialTailMatch[1] ?? "";
          const remainder = factorialTailMatch[3] ?? "";
          changed = true;
          return `$${repairExplicitMathLatex(`${normalizedLatex}!`)}$${leadingWhitespace}${remainder}`;
        }

        if (/^\s*=/.test(trailingText)) {
          const relationTail = trailingText.replace(/^\s*=\s*/, "");
          const { candidate, remainder } =
            extractLeadingStoredMathContinuation(relationTail);
          if (candidate && isLikelyStoredMathContinuationTail(candidate)) {
            changed = true;
            return `$${repairExplicitMathLatex(
              `${normalizedLatex} = ${candidate}`,
            )}$${remainder}`;
          }
        }

        const { candidate, remainder } =
          extractLeadingStoredMathContinuation(trailingText);
        if (candidate && isLikelyStoredMathContinuationTail(candidate)) {
          changed = true;
          return `$${repairExplicitMathLatex(
            `${normalizedLatex} ${candidate}`,
          )}$${remainder}`;
        }

        return match;
      },
    );
    current = mergeAdjacentStoredInlineLatex(current);
  } while (changed);

  return current;
}

function repairStoredLegacyMixedMath(value: string) {
  let current = value;
  let previous = "";

  while (current !== previous) {
    previous = current;
    current = repairSplitStoredDelimitedSumProductExpressions(current);
    current = foldStoredInlineMathContinuationTails(current);
  }

  return current;
}

function looksLikeStoredInlineMathFragment(value: string) {
  const normalized = repairExplicitMathLatex(value).trim();
  if (!normalized) return false;
  if (/[\u4e00-\u9fff]/.test(normalized)) return false;
  if (!/[A-Za-z0-9\\]/.test(normalized)) return false;
  return /[\\_^=<>|+\-−*/()]/.test(normalized) || /\d/.test(normalized);
}

function peelStoredDanglingInlineClosers(value: string) {
  let core = value.trimEnd();
  let suffix = "";

  while (/[)\].,;:!?]$/.test(core)) {
    const lastChar = core.at(-1) ?? "";
    if (
      (lastChar === ")" && (core.match(/\(/g)?.length ?? 0) >= (core.match(/\)/g)?.length ?? 0)) ||
      (lastChar === "]" && (core.match(/\[/g)?.length ?? 0) >= (core.match(/\]/g)?.length ?? 0))
    ) {
      break;
    }

    suffix = `${lastChar}${suffix}`;
    core = core.slice(0, -1).trimEnd();
  }

  return {
    core,
    suffix,
  };
}

function repairStoredBrokenExplicitInlineMathSegments(value: string) {
  return value.replace(/(?<!\$)\$([^\n$]+?)\$(?!\$)/g, (match, rawLatex: string) => {
    const { core, suffix } = peelStoredDanglingInlineClosers(rawLatex);
    if (!core) {
      return match;
    }

    const clauseMatch = core.match(/^(.+?)(,\s*(?:with|where|which|that)\s+)(.+)$/i);
    if (clauseMatch) {
      const left = clauseMatch[1]?.trim() ?? "";
      const bridge = clauseMatch[2] ?? "";
      const right = clauseMatch[3]?.trim() ?? "";

      if (looksLikeStoredInlineMathFragment(left) && isLikelyStoredMathContinuationTail(right)) {
        return `$${repairExplicitMathLatex(left)}$${bridge}$${repairExplicitMathLatex(right)}$${suffix}`;
      }
    }

    const conjunctionMatch = core.match(/^(.+?)\s+(and|or)\s+(.+)$/i);
    if (conjunctionMatch) {
      const left = conjunctionMatch[1]?.trim() ?? "";
      const conjunction = conjunctionMatch[2] ?? "";
      const right = conjunctionMatch[3]?.trim() ?? "";

      if (looksLikeStoredInlineMathFragment(left) && looksLikeStoredInlineMathFragment(right)) {
        return `$${repairExplicitMathLatex(left)}$ ${conjunction} $${repairExplicitMathLatex(right)}$${suffix}`;
      }
    }

    if (suffix && looksLikeStoredInlineMathFragment(core)) {
      return `$${repairExplicitMathLatex(core)}$${suffix}`;
    }

    return `$${repairExplicitMathLatex(rawLatex)}$`;
  });
}

const exerciseContentLeafSchema = z.discriminatedUnion("kind", [
  z.object({
    id: z.string().min(1),
    kind: z.literal("text"),
    text: z.string(),
  }),
  z.object({
    id: z.string().min(1),
    kind: z.literal("image"),
    src: z.string().trim().min(1),
    alt: z.string().nullable().optional(),
  }),
]);

const exerciseContentOptionSchema = z.object({
  id: z.string().min(1),
  label: z.string().trim().min(1),
  blocks: z.array(exerciseContentLeafSchema),
  isCorrect: z.boolean().optional(),
});

export const exerciseContentSchema = z.object({
  version: z.literal(1),
  type: z.enum(["MC", "FR", "fill_in", "TF"]),
  stem: z.array(exerciseContentLeafSchema),
  options: z.array(exerciseContentOptionSchema).nullable().optional(),
  answer: z.array(exerciseContentLeafSchema).nullable().optional(),
  explanation: z.array(exerciseContentLeafSchema).nullable().optional(),
  answerSpace: z.enum(["small", "medium", "large"]).nullable().optional(),
  commonMistakes: z.array(z.string()).optional(),
});

function createTextLeaf(text: string): ExerciseContentLeaf {
  return {
    id: crypto.randomUUID(),
    kind: "text",
    text,
  };
}

function createImageLeaf(src: string, alt?: string | null): ExerciseContentLeaf {
  return {
    id: crypto.randomUUID(),
    kind: "image",
    src,
    alt: alt?.trim() || null,
  };
}

function cleanText(value: string | null | undefined) {
  return `${value ?? ""}`.replace(/\s+/g, " ").trim();
}

function normalizeStoredMathText(value: string) {
  const inlinePromptMatch = value.match(INLINE_FORMULA_PROMPT_PATTERN);
  if (inlinePromptMatch) {
    const latex = inlinePromptMatch[1] ?? "";
    const trailing = inlinePromptMatch[2] ?? "";
    return `$${repairExplicitMathLatex(latex)}$ ${trailing}`.trimEnd();
  }

  const restored = repairStoredLegacyMixedMath(
    repairBrokenInlineMathDelimiters(
      repairStoredBrokenExplicitInlineMathSegments(
        repairDelimitedMathMarkup(restoreMathTagMarkupToLatex(value)),
      ),
    ),
  );
  if (
    EXPLICIT_LATEX_DELIMITER_PATTERN.test(restored) &&
    !hasMixedPlainTextMathOutsideExplicitDelimiters(restored)
  ) {
    return restored;
  }

  return repairStoredLegacyMixedMath(
    restoreMathTagMarkupToLatex(normalizeMathText(restored)),
  );
}

function normalizeStoredTextOutsideMarkdownImages(value: string) {
  if (!value || !value.includes("![")) {
    return normalizeStoredMathText(value);
  }

  const parts: string[] = [];
  let lastIndex = 0;

  for (const match of value.matchAll(MARKDOWN_IMAGE_PATTERN)) {
    const index = match.index ?? -1;
    if (index < 0) continue;

    parts.push(normalizeStoredMathText(value.slice(lastIndex, index)));
    parts.push(match[0]);
    lastIndex = index + match[0].length;
  }

  parts.push(normalizeStoredMathText(value.slice(lastIndex)));
  return parts.join("");
}

export function normalizeStoredExerciseText(text: string | null | undefined) {
  const source = `${text ?? ""}`;
  if (!source) return source;

  const leadingWhitespace = source.match(/^\s*/)?.[0] ?? "";
  const trailingWhitespace = source.match(/\s*$/)?.[0] ?? "";
  const core = source.slice(
    leadingWhitespace.length,
    Math.max(leadingWhitespace.length, source.length - trailingWhitespace.length),
  );
  if (!core) return source;

  return `${leadingWhitespace}${normalizeStoredTextOutsideMarkdownImages(core)}${trailingWhitespace}`;
}

function normalizeExerciseContentLeaf(block: ExerciseContentLeaf): ExerciseContentLeaf {
  if (block.kind !== "text") {
    return block;
  }

  const normalizedText = normalizeStoredExerciseText(block.text);
  if (normalizedText === block.text) {
    return block;
  }

  return {
    ...block,
    text: normalizedText,
  };
}

export function normalizeExerciseContentForStorage(content: ExerciseContent): ExerciseContent {
  return {
    ...content,
    stem: content.stem.map(normalizeExerciseContentLeaf),
    options:
      content.options?.map((option) => ({
        ...option,
        blocks: option.blocks.map(normalizeExerciseContentLeaf),
      })) ?? null,
    answer: content.answer?.map(normalizeExerciseContentLeaf) ?? null,
    explanation: content.explanation?.map(normalizeExerciseContentLeaf) ?? null,
  };
}

export function markdownToExerciseContentLeaves(markdown: string | null | undefined) {
  const source = `${markdown ?? ""}`;
  const blocks: ExerciseContentLeaf[] = [];
  let lastIndex = 0;

  for (const match of source.matchAll(MARKDOWN_IMAGE_PATTERN)) {
    const index = match.index ?? -1;
    if (index < 0) continue;

    const before = source.slice(lastIndex, index);
    if (before) {
      blocks.push(createTextLeaf(before));
    }

    blocks.push(createImageLeaf(match[2] ?? "", match[1] ?? null));
    lastIndex = index + match[0].length;
  }

  const tail = source.slice(lastIndex);
  if (tail) {
    blocks.push(createTextLeaf(tail));
  }

  if (blocks.length === 0) {
    return [createTextLeaf("")];
  }

  return blocks;
}

export function exerciseContentLeavesToMarkdown(
  blocks: ExerciseContentLeaf[] | null | undefined,
) {
  return (blocks ?? [])
    .map((block) =>
      block.kind === "text"
        ? block.text
        : `![${block.alt?.trim() || ""}](${block.src})`,
    )
    .join("")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function readExerciseContent(raw: unknown): ExerciseContent | null {
  const parsed = exerciseContentSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export function buildExerciseContentFromLegacy(params: {
  type: ExerciseType | "TF";
  questionText: string;
  options?: ExerciseOption[] | null;
  correctAnswer?: string | null;
  solutionSteps?: string | null;
  commonMistakes?: string[] | null;
}) {
  const base: ExerciseContent = {
    version: 1,
    type: params.type,
    stem: markdownToExerciseContentLeaves(params.questionText),
    options: null,
    answer: params.correctAnswer
      ? markdownToExerciseContentLeaves(params.correctAnswer)
      : null,
    explanation: params.solutionSteps
      ? markdownToExerciseContentLeaves(params.solutionSteps)
      : null,
    answerSpace: params.type === "FR" ? "medium" : null,
    commonMistakes: params.commonMistakes?.filter(Boolean) ?? [],
  };

  if (params.type === "MC") {
    base.options =
      params.options?.map((option) => ({
        id: crypto.randomUUID(),
        label: option.label,
        blocks: markdownToExerciseContentLeaves(option.text),
        isCorrect: option.isCorrect,
      })) ?? [];
  }

  return base;
}

export function normalizeExerciseContent(content: ExerciseContent): ExerciseContent {
  const stem =
    content.stem.length > 0
      ? content.stem
      : [createTextLeaf("")];
  const options =
    content.type === "MC"
      ? normalizeExerciseContentOptionList(content.options)
      : null;

  return {
    ...content,
    stem,
    options,
    answer: content.answer?.length ? content.answer : null,
    explanation: content.explanation?.length ? content.explanation : null,
    commonMistakes: content.commonMistakes ?? [],
  };
}

export function deriveLegacyExerciseFieldsFromContent(content: ExerciseContent) {
  const questionText = exerciseContentLeavesToMarkdown(content.stem);
  const options =
    content.type === "MC"
      ? (content.options ?? []).map((option) => ({
          label: option.label,
          text: exerciseContentLeavesToMarkdown(option.blocks),
          isCorrect: Boolean(option.isCorrect),
        }))
      : null;

  const answerFromBlocks = exerciseContentLeavesToMarkdown(content.answer);
  const answerFromOptions =
    content.type === "MC"
      ? (content.options ?? []).find((option) => option.isCorrect)?.label ?? ""
      : "";

  return {
    questionText,
    options,
    correctAnswer: answerFromBlocks || answerFromOptions || "",
    solutionSteps: exerciseContentLeavesToMarkdown(content.explanation),
    commonMistakes: content.commonMistakes ?? [],
  };
}

export function buildExerciseTitleFromContent(content: ExerciseContent) {
  const title = cleanText(
    (content.stem ?? [])
      .filter((block): block is Extract<ExerciseContentLeaf, { kind: "text" }> => block.kind === "text")
      .map((block) => block.text)
      .join(" "),
  );
  if (!title) return "未命名题目";
  return title.length > 88 ? `${title.slice(0, 88)}…` : title;
}

export function normalizeExerciseContentOptionList(
  options: ExerciseContentOption[] | null | undefined,
) {
  return (options ?? []).map((option) => ({
    ...option,
    label: option.label.trim(),
    blocks: option.blocks.length > 0 ? option.blocks : [createTextLeaf("")],
  }));
}
