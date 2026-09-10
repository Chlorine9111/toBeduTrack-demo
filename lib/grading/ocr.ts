import type { AnswerKeyItem } from "@/lib/grading/types";
import { inferAnswerKeyLanguageHint } from "@/lib/grading/strategy-router";
import type { OcrQuestionContext } from "@/lib/ocr/types";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { hasMathpixCredentials, recognizeImageMmd } from "@/lib/pdf-scan/mathpix";
import { hasMistralOcrCredentials, ocrImageWithMistral } from "@/lib/pdf-scan/mistral-ocr";
import { selectOcrProvider, type OcrProvider } from "@/lib/pdf-scan/ocr-router";
import { renderPdfPages } from "@/lib/pdf-scan/pdf-render";
import { recognizeWithFallback } from "@/lib/ocr/ocr-router";

function resolveMimeType(path: string) {
  const lower = path.toLowerCase();
  if (lower.endsWith(".png")) return "image/png" as const;
  return "image/jpeg" as const;
}

function buildOcrQuestionContext(answerKey: AnswerKeyItem[]): OcrQuestionContext[] {
  return answerKey
    .slice()
    .sort((left, right) => left.questionNumber - right.questionNumber)
    .map((item) => ({
      questionNumber: item.questionNumber,
      questionText: item.questionText,
      questionType: item.questionType,
      responseMode: item.responseMode,
      subjectHint: item.subjectHint,
      languageHint: item.languageHint,
      knowledgePoints: item.knowledgePoints,
      correctAnswer: item.questionType === "MC" ? item.correctAnswer : undefined,
    }));
}

function normalizeRecognizedText(text: string) {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function parseRecognizedPageText(
  text: string,
  startQuestionNumber: number,
) {
  const lines = normalizeRecognizedText(text)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const questions: Array<{
    questionNumber: number;
    studentAnswer: string;
    confidence: number;
  }> = [];
  let nextQuestionNumber = Math.max(1, startQuestionNumber);
  let current: {
    questionNumber: number;
    parts: string[];
    confidence: number;
  } | null = null;

  const flushCurrent = () => {
    if (!current) return;
    const studentAnswer = current.parts.join("\n").trim();
    if (!studentAnswer) {
      current = null;
      return;
    }

    questions.push({
      questionNumber: current.questionNumber,
      studentAnswer,
      confidence: current.confidence,
    });
    current = null;
  };

  for (const line of lines) {
    const numbered = line.match(/^(?:第\s*)?(\d{1,3})\s*(?:题|[.、．:：)\]])\s*(.*)$/);
    if (numbered) {
      flushCurrent();
      const questionNumber = Number(numbered[1]);
      current = {
        questionNumber,
        parts: numbered[2] ? [numbered[2].trim()] : [],
        confidence: 0.72,
      };
      nextQuestionNumber = Math.max(nextQuestionNumber, questionNumber + 1);
      continue;
    }

    if (!current) {
      current = {
        questionNumber: nextQuestionNumber,
        parts: [line],
        confidence: 0.58,
      };
      nextQuestionNumber += 1;
      continue;
    }

    current.parts.push(line);
  }

  flushCurrent();

  return {
    questions,
    nextQuestionNumber,
  };
}

function buildPdfSubjectHint(answerKey: AnswerKeyItem[] | undefined, sessionTitle: string | null | undefined) {
  const hints = new Set<string>();

  for (const item of answerKey ?? []) {
    if (item.subjectHint?.trim()) {
      hints.add(item.subjectHint.trim());
    }
  }

  if (sessionTitle?.trim()) {
    hints.add(sessionTitle.trim());
  }

  return Array.from(hints).join(" ");
}

function buildPdfOcrCandidates(preferredProvider: OcrProvider) {
  const candidates: Array<{
    provider: OcrProvider;
    label: string;
    canUse: () => boolean;
    recognize: (buffer: Buffer) => Promise<string>;
  }> = [];

  const pushCandidate = (provider: OcrProvider) => {
    if (provider === "mathpix") {
      candidates.push({
        provider,
        label: "mathpix-image",
        canUse: hasMathpixCredentials,
        recognize: (buffer) => recognizeImageMmd(buffer),
      });
      return;
    }

    candidates.push({
      provider,
      label: "mistral-image",
      canUse: hasMistralOcrCredentials,
      recognize: (buffer) => ocrImageWithMistral(buffer, "image/png"),
    });
  };

  pushCandidate(preferredProvider);
  pushCandidate(preferredProvider === "mathpix" ? "mistral" : "mathpix");

  return candidates.filter((candidate, index, array) =>
    array.findIndex((item) => item.provider === candidate.provider) === index
  );
}

async function recognizePdfPages(params: {
  buffers: Buffer[];
  fileName: string;
  answerKey?: AnswerKeyItem[];
  sessionTitle?: string | null;
}) {
  const route = selectOcrProvider({
    fileName: params.fileName,
    subject: buildPdfSubjectHint(params.answerKey, params.sessionTitle),
  });
  const candidates = buildPdfOcrCandidates(route.provider);
  const startQuestionNumber = params.answerKey?.[0]?.questionNumber ?? 1;
  let lastError: string | null = null;

  for (const candidate of candidates) {
    if (!candidate.canUse()) {
      lastError = `${candidate.label}: 未配置凭据`;
      continue;
    }

    try {
      let nextQuestionNumber = startQuestionNumber;
      const pages = [] as Array<{
        pageNumber: number;
        questions: Array<{
          questionNumber: number;
          studentAnswer: string;
          confidence: number;
        }>;
      }>;

      for (let index = 0; index < params.buffers.length; index += 1) {
        const text = await candidate.recognize(params.buffers[index]);
        const parsed = parseRecognizedPageText(text, nextQuestionNumber);
        nextQuestionNumber = parsed.nextQuestionNumber;
        pages.push({
          pageNumber: index + 1,
          questions: parsed.questions,
        });
      }

      return {
        provider: candidate.label,
        ocrResult: { pages },
      };
    } catch (error) {
      lastError = `${candidate.label}: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  throw new Error(lastError ?? "PDF OCR 失败");
}

export async function recognizeSubmissionByStoragePath(
  storagePath: string,
  options?: {
    answerKey?: AnswerKeyItem[];
    sessionTitle?: string | null;
    abortSignal?: AbortSignal;
  },
) {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin.storage.from("pdfs").download(storagePath);

  if (error || !data) {
    throw new Error(`下载答卷文件失败: ${error?.message ?? "unknown"}`);
  }

  const rawBuffer = Buffer.from(await data.arrayBuffer());
  const isPdf = storagePath.toLowerCase().endsWith(".pdf");

  const buffers: Buffer[] = [];
  let mimeType: "image/png" | "image/jpeg" = "image/jpeg";

  if (isPdf) {
    const pages = await renderPdfPages(rawBuffer, 1.8);
    const recognized = await recognizePdfPages({
      buffers: pages.map((page) => page.buffer),
      fileName: storagePath,
      answerKey: options?.answerKey,
      sessionTitle: options?.sessionTitle,
    });

    return {
      provider: recognized.provider,
      ocrResult: recognized.ocrResult,
      pageCount: pages.length,
    };
  }

  buffers.push(rawBuffer);
  mimeType = resolveMimeType(storagePath);

  const questionContext = options?.answerKey?.length ? buildOcrQuestionContext(options.answerKey) : undefined;
  const language =
    options?.answerKey?.length
      ? inferAnswerKeyLanguageHint(options.answerKey, options.sessionTitle)
      : "zh-CN";

  const recognized = await recognizeWithFallback({
    buffers,
    mimeType,
    language,
    sessionTitle: options?.sessionTitle ?? undefined,
    questionContext,
    abortSignal: options?.abortSignal,
  });

  return {
    provider: recognized.provider,
    ocrResult: recognized.result,
    pageCount: buffers.length,
  };
}
