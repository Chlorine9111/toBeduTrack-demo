import { geminiOcrEngine } from "@/lib/ocr/gemini-ocr";
import { baiduOcrEngine } from "@/lib/ocr/baidu-ocr";
import { mathpixOcrEngine } from "@/lib/ocr/mathpix-ocr";
import type { OcrEngineInput, OcrOutput } from "@/lib/ocr/types";

type Candidate = {
  name: string;
  run: () => Promise<OcrOutput>;
};

function hasUsefulResult(result: OcrOutput) {
  return result.pages.some((page) => page.questions.length > 0);
}

export async function recognizeWithFallback(input: OcrEngineInput) {
  const engines: Candidate[] = [
    {
      name: "gemini",
      run: () => geminiOcrEngine.recognize(input),
    },
    {
      name: "baidu_ocr",
      run: () => baiduOcrEngine.recognize(input),
    },
    {
      name: "mathpix",
      run: () => mathpixOcrEngine.recognize(input),
    },
  ];

  let lastError: string | null = null;
  for (const engine of engines) {
    try {
      const result = await engine.run();
      if (hasUsefulResult(result)) {
        return {
          provider: engine.name,
          result,
        };
      }
      lastError = `${engine.name}: empty result`;
    } catch (error) {
      lastError = `${engine.name}: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  throw new Error(lastError ?? "OCR failed");
}
