/**
 * Rubric generator: assemble prompt -> call Kimi -> validate output.
 */
import type { MockRubric } from "@/types/chatflow";
import type { RubricAIOutput } from "@/types/rubric";
import { rubricAIOutputSchema } from "@/lib/validation/ai";
import {
  buildRubricPrompt,
  renderSystemPrompt,
  type RubricPromptInput,
} from "@/lib/ai/prompt-assembler";
import {
  generateStructuredObject,
} from "@/lib/ai/structured-output";
import { getResolvedLanguageModelForTask } from "@/lib/ai/model-router";
import { createDeadlineSignal } from "@/lib/runtime/deadline";

function normalizeJsonCandidate(value: string) {
  return value
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/, "");
}

function parseJsonCandidate(value: string): unknown {
  const normalized = normalizeJsonCandidate(value);
  try {
    return JSON.parse(normalized);
  } catch {
    const sanitizedLatex = normalized.replace(/(?<!\\)\\(?=[A-Za-z]{2,})/g, "\\\\");
    try {
      return JSON.parse(sanitizedLatex);
    } catch {
      return null;
    }
  }
}

function parseJsonString(value: string, maxDepth = 3): unknown {
  let current: unknown = normalizeJsonCandidate(value);

  for (let depth = 0; depth < maxDepth; depth += 1) {
    if (typeof current !== "string") {
      return current;
    }

    const parsed = parseJsonCandidate(current);
    if (parsed === null) {
      return depth === 0 ? null : current;
    }
    current = parsed;
  }

  return current;
}

function coerceRubricOutput(raw: unknown): unknown {
  if (typeof raw === "string") {
    const parsedRaw = parseJsonString(raw);
    if (parsedRaw && typeof parsedRaw === "object" && !Array.isArray(parsedRaw)) {
      return coerceRubricOutput(parsedRaw);
    }
    return raw;
  }

  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return raw;
  }

  const candidate = { ...(raw as Record<string, unknown>) };

  if (typeof candidate.dimensions === "string") {
    const parsedDimensions = parseJsonString(candidate.dimensions);
    if (Array.isArray(parsedDimensions)) {
      candidate.dimensions = parsedDimensions;
    }
  }

  if (Array.isArray(candidate.dimensions)) {
    candidate.dimensions = candidate.dimensions.map((dimension) => {
      if (!dimension || typeof dimension !== "object" || Array.isArray(dimension)) {
        return dimension;
      }
      const normalizedDimension = { ...(dimension as Record<string, unknown>) };
      if (typeof normalizedDimension.levels === "string") {
        const parsedLevels = parseJsonString(normalizedDimension.levels);
        if (parsedLevels && typeof parsedLevels === "object" && !Array.isArray(parsedLevels)) {
          normalizedDimension.levels = parsedLevels;
        }
      }
      return normalizedDimension;
    });
  }

  return candidate;
}

function normalizeRubricWeightsToPercent<T extends { dimensions: Array<{ weight: number }> }>(rubric: T): T {
  const dims = Array.isArray(rubric.dimensions) ? rubric.dimensions : [];
  const rawSum = dims.reduce((sum, d) => sum + (Number.isFinite(d.weight) ? d.weight : 0), 0);
  if (!(rawSum > 0)) return rubric;

  // Heuristic: some prompts/tools return normalized weights that sum to ~1.0.
  // Convert to percent so UI/DB/PDF can treat weight consistently as 0-100.
  const needsPercent = rawSum <= 1.5;
  const percentWeights = needsPercent ? dims.map((d) => d.weight * 100) : dims.map((d) => d.weight);

  // If already percent-like but not summing to 100, scale softly to 100.
  const sumAfter = percentWeights.reduce((sum, w) => sum + w, 0);
  const scale = sumAfter > 0 && Math.abs(sumAfter - 100) > 0.01 && sumAfter > 10 ? 100 / sumAfter : 1;
  const scaled = percentWeights.map((w) => w * scale);

  // Round to integers while preserving total 100 (largest remainder method).
  const floors = scaled.map((w) => Math.floor(Math.max(0, w)));
  let remainder = 100 - floors.reduce((s, v) => s + v, 0);
  const order = scaled
    .map((w, i) => ({ i, frac: w - Math.floor(w) }))
    .sort((a, b) => b.frac - a.frac);
  const rounded = [...floors];
  for (let k = 0; k < order.length && remainder !== 0; k += 1) {
    const idx = order[k].i;
    if (remainder > 0) {
      rounded[idx] += 1;
      remainder -= 1;
    } else if (remainder < 0 && rounded[idx] > 0) {
      rounded[idx] -= 1;
      remainder += 1;
    }
  }

  return {
    ...rubric,
    dimensions: rubric.dimensions.map((d, i) => ({
      ...d,
      weight: Math.max(0, Math.min(100, rounded[i] ?? 0)),
    })),
  };
}

type RubricPreviewUpdate = {
  delta: string;
  snapshot: string;
  reset: boolean;
};

function convertMockRubricToAiOutput(mock: MockRubric): RubricAIOutput {
  return {
    title: mock.title,
    dimensions: mock.dimensions.map((dimension) => ({
      name: dimension.name,
      description:
        dimension.description.trim() ||
        `${dimension.name.trim()} 的评分说明`,
      weight: dimension.weight,
      levels: {
        excellent: dimension.levels.excellent,
        good: dimension.levels.good,
        passing: dimension.levels.passing,
        failing: dimension.levels.failing,
      },
    })),
  };
}

function finalizeRubricOutput(raw: unknown) {
  const parsed = rubricAIOutputSchema.parse(coerceRubricOutput(raw));
  return normalizeRubricWeightsToPercent(parsed);
}

function formatPartialCell(value: string | undefined) {
  if (!value) return "";
  return value.replace(/\r\n?/g, " ").replace(/\n+/g, " ").replace(/\|/g, "／").replace(/\s+/g, " ").trim();
}

function serializePartialRubricToMarkdown(partial: Partial<RubricAIOutput>): string {
  const lines: string[] = [];

  if (partial.title) {
    lines.push(`# ${partial.title}`, "");
  }

  if (Array.isArray(partial.dimensions) && partial.dimensions.length > 0) {
    lines.push(
      "| Dimension | Excellent | Good | Passing | Failing | Weight |",
      "| --- | --- | --- | --- | --- | --- |",
    );

    for (const dim of partial.dimensions) {
      if (!dim || typeof dim !== "object" || !("name" in dim)) continue;
      const d = dim as Partial<RubricAIOutput["dimensions"][number]>;
      if (!d.name) continue;
      lines.push(
        `| ${formatPartialCell(d.name)} | ${formatPartialCell(d.levels?.excellent)} | ${formatPartialCell(d.levels?.good)} | ${formatPartialCell(d.levels?.passing)} | ${formatPartialCell(d.levels?.failing)} | ${d.weight != null ? `${d.weight}%` : ""} |`,
      );
    }
  }

  return lines.join("\n");
}

export async function generateRubric(
  input: RubricPromptInput,
  options?: {
    onPreview?: (update: RubricPreviewUpdate) => void | Promise<void>;
  },
): Promise<RubricAIOutput> {
  const { prompt, systemContext } = await buildRubricPrompt(input);
  const systemPrompt = await renderSystemPrompt(systemContext, "rubric", {
    track: input.track,
    subjectCategory: input.subjectCategory,
  });

  const model = getResolvedLanguageModelForTask("rubric_generate");

  const deadline = createDeadlineSignal({
    timeoutMs: 120_000,
    reason: "rubric generation timeout",
  });

  try {
    const raw = await generateStructuredObject({
      model,
      schema: rubricAIOutputSchema,
      systemPrompt,
      userPrompt: prompt,
      maxTokens: 6500,
      temperature: 0.4,
      abortSignal: deadline.signal,
    });

    const result = finalizeRubricOutput(raw);

    // 生成完成后发送完整预览
    if (options?.onPreview) {
      const snapshot = serializePartialRubricToMarkdown(result);
      if (snapshot) {
        await options.onPreview({ delta: "", snapshot, reset: true });
      }
    }

    return result;
  } finally {
    deadline.clear();
  }
}
