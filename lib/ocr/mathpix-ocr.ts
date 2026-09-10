import { recognizeImageMmd } from "@/lib/pdf-scan/mathpix";
import type { OcrEngine, OcrEngineInput, OcrOutput } from "@/lib/ocr/types";

function parseMmdToQuestions(text: string) {
  const lines = text
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);

  let current = 1;
  return lines.map((line) => {
    const match = line.match(/^(\d+)[\.、\)]\s*(.*)$/);
    if (match) {
      current = Number(match[1]);
      return {
        questionNumber: current,
        studentAnswer: match[2] || "",
        confidence: 0.64,
      };
    }

    const result = {
      questionNumber: current,
      studentAnswer: line,
      confidence: 0.58,
    };
    current += 1;
    return result;
  });
}

export const mathpixOcrEngine: OcrEngine = {
  async recognize(input: OcrEngineInput): Promise<OcrOutput> {
    const pages: OcrOutput["pages"] = [];

    for (let i = 0; i < input.buffers.length; i += 1) {
      const text = await recognizeImageMmd(input.buffers[i]);
      pages.push({
        pageNumber: i + 1,
        questions: parseMmdToQuestions(text),
      });
    }

    return { pages };
  },
};
