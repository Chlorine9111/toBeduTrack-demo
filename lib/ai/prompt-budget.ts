type PromptBudgetSection = {
  key: string;
  text: string;
  weight?: number;
  minTokens?: number;
  maxTokens?: number;
  preserveTail?: boolean;
};

const DEFAULT_MIN_TOKENS = 80;

function countMatches(text: string, pattern: RegExp) {
  return text.match(pattern)?.length ?? 0;
}

export function estimateTokenCount(text: string) {
  if (!text.trim()) return 0;

  const normalized = text.replace(/\s+/g, " ").trim();
  const cjkChars = countMatches(normalized, /[\u3400-\u9fff]/g);
  const latinWords = normalized.match(/[A-Za-z]+(?:['-][A-Za-z]+)*/g)?.length ?? 0;
  const digits = normalized.match(/\d/g)?.length ?? 0;
  const punctuation = normalized.match(/[，。！？；：“”‘’、,.!?;:()[\]{}\-_/\\|@#$%^&*+=~`]/g)?.length ?? 0;
  const whitespace = normalized.match(/\s/g)?.length ?? 0;

  const estimate =
    cjkChars * 1.15 +
    latinWords * 1.35 +
    digits * 0.45 +
    punctuation * 0.18 +
    whitespace * 0.05;

  return Math.max(1, Math.ceil(estimate));
}

function sliceTextByRatio(text: string, ratio: number, preserveTail = false) {
  const normalized = text.trim();
  if (!normalized) return "";
  if (ratio >= 1) return normalized;
  if (ratio <= 0) return "";

  const targetLength = Math.max(40, Math.floor(normalized.length * ratio));
  if (targetLength >= normalized.length) return normalized;

  if (preserveTail && targetLength >= 120) {
    const headLength = Math.max(24, Math.floor(targetLength * 0.72));
    const tailLength = Math.max(16, targetLength - headLength);
    return `${normalized.slice(0, headLength).trim()}\n...\n${normalized.slice(-tailLength).trim()}`.trim();
  }

  return `${normalized.slice(0, targetLength).trim()}\n...(truncated)`;
}

export function trimTextToApproxTokens(
  text: string,
  maxTokens: number,
  options?: { preserveTail?: boolean },
) {
  const normalized = text.trim();
  if (!normalized) return "";
  const estimated = estimateTokenCount(normalized);
  if (estimated <= maxTokens) return normalized;

  const ratio = maxTokens / estimated;
  return sliceTextByRatio(normalized, ratio, options?.preserveTail ?? false);
}

export function budgetPromptSections(
  sections: PromptBudgetSection[],
  totalTokens: number,
) {
  const prepared = sections.map((section) => {
    const normalizedText = section.text.trim();
    const estimated = estimateTokenCount(normalizedText);
    return {
      ...section,
      text: normalizedText,
      estimated,
      allocated: normalizedText
        ? Math.min(
            estimated,
            section.maxTokens ?? Number.POSITIVE_INFINITY,
            section.minTokens ?? DEFAULT_MIN_TOKENS,
          )
        : 0,
    };
  });

  const used = prepared.reduce((sum, section) => sum + section.allocated, 0);
  let remaining = Math.max(0, totalTokens - used);

  while (remaining > 0) {
    const growable = prepared.filter(
      (section) =>
        section.text &&
        section.allocated < section.estimated &&
        section.allocated < (section.maxTokens ?? Number.POSITIVE_INFINITY),
    );
    if (growable.length === 0) break;

    const totalWeight = growable.reduce((sum, section) => sum + (section.weight ?? 1), 0) || 1;
    let distributed = 0;

    for (const section of growable) {
      const share = Math.max(
        1,
        Math.floor((remaining * (section.weight ?? 1)) / totalWeight),
      );
      const maxGrow = Math.min(
        share,
        section.estimated - section.allocated,
        (section.maxTokens ?? Number.POSITIVE_INFINITY) - section.allocated,
      );
      if (maxGrow <= 0) continue;
      section.allocated += maxGrow;
      distributed += maxGrow;
    }

    if (distributed <= 0) break;
    remaining -= distributed;
  }

  return Object.fromEntries(
    prepared.map((section) => [
      section.key,
      trimTextToApproxTokens(section.text, Math.max(0, section.allocated), {
        preserveTail: section.preserveTail,
      }),
    ]),
  ) as Record<string, string>;
}
