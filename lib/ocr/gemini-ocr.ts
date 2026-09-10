import { assertGeminiOpenRouterConfigured, callGeminiOpenRouterJson } from "@/lib/ai/gemini-openrouter-helper";
import { preprocessImage } from "@/lib/ocr/image-preprocess";
import type { OcrEngine, OcrEngineInput, OcrOutput, OcrQuestionContext } from "@/lib/ocr/types";

function normalizeOutput(data: unknown): OcrOutput {
  if (!data || typeof data !== "object") return { pages: [] };
  const pages = Array.isArray((data as { pages?: unknown[] }).pages)
    ? (data as { pages: unknown[] }).pages
    : [];

  return {
    pages: pages.map((page, index) => {
      const raw = page as { pageNumber?: number; questions?: unknown[] };
      const questions = Array.isArray(raw.questions) ? raw.questions : [];
      return {
        pageNumber: Number(raw.pageNumber ?? index + 1),
        questions: questions
          .map((item) => item as { questionNumber?: number; studentAnswer?: string; confidence?: number })
          .filter((item) => item.questionNumber && item.studentAnswer !== undefined)
          .map((item) => ({
            questionNumber: Number(item.questionNumber),
            studentAnswer: String(item.studentAnswer ?? ""),
            confidence: Math.max(0, Math.min(1, Number(item.confidence ?? 0.75))),
          })),
      };
    }),
  };
}

function truncateText(value: string | undefined, maxLength: number) {
  const cleaned = `${value ?? ""}`.replace(/\s+/g, " ").trim();
  if (cleaned.length <= maxLength) return cleaned;
  return `${cleaned.slice(0, maxLength - 1)}…`;
}

function buildQuestionContextPayload(context: OcrQuestionContext[]) {
  return context.slice(0, 40).map((item) => ({
    questionNumber: item.questionNumber,
    questionText: truncateText(item.questionText, 240),
    questionType: item.questionType ?? null,
    responseMode: item.responseMode ?? null,
    subjectHint: item.subjectHint ?? null,
    languageHint: item.languageHint ?? null,
    knowledgePoints: item.knowledgePoints ?? [],
  }));
}

function buildOcrInstruction(input: OcrEngineInput) {
  const lines = [
    "请识别每页学生答卷，提取每个题号对应的学生作答内容。",
    `优先识别语言: ${input.language ?? "en-US"}`,
    "仅输出 JSON，格式必须是 { pages: [{ pageNumber, questions: [{ questionNumber, studentAnswer, confidence }] }] }",
    "confidence 必须是 0 到 1 之间的小数。",
    "如果同一页能明显看出多个题号，请分别拆开。",
    "如果答案是数学题，请尽量保留公式、符号、分数、上下标和等价表达，不要擅自改写成口语。",
    "如果答案主要是图示/结构图，请在 studentAnswer 中用简短文字描述图中的关键标签、箭头或结构；看不清时降低 confidence。",
    "如果图片里没有清晰题号，但题目上下文足够强，可以按最可能的题号映射；没有把握时不要瞎填。",
    "学生未作答时，可返回空字符串并把 confidence 设低。",
  ];

  if (input.sessionTitle) {
    lines.push(`判卷任务标题: ${truncateText(input.sessionTitle, 120)}`);
  }

  if (input.questionContext?.length) {
    lines.push("题目上下文如下，请优先参考这些题号、题型和题干：");
    lines.push(JSON.stringify(buildQuestionContextPayload(input.questionContext), null, 2));
  }

  return lines.join("\n");
}

export const geminiOcrEngine: OcrEngine = {
  async recognize(input: OcrEngineInput): Promise<OcrOutput> {
    assertGeminiOpenRouterConfigured();

    const model =
      process.env.GRADING_OCR_GEMINI_MODEL ??
      process.env.GEMINI_SCORING_MODEL ??
      process.env.OPENROUTER_OCR_MODEL ??
      "gemini-3.1-pro-preview";
    const images = await Promise.all(input.buffers.map((buffer) => preprocessImage(buffer)));

    const content = [
      {
        type: "text" as const,
        text: buildOcrInstruction(input),
      },
      ...images.map((buffer) => ({
        type: "image" as const,
        image: buffer,
        mediaType: input.mimeType,
      })),
    ];

    const { data } = await callGeminiOpenRouterJson<unknown>({
      capability: "ocr",
      model,
      messages: [{ role: "user", content }],
      temperature: 0,
      maxTokens: 3200,
      abortSignal: input.abortSignal,
    });

    return normalizeOutput(data);
  },
};
