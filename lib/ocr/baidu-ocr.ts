import type { OcrEngine, OcrEngineInput, OcrOutput } from "@/lib/ocr/types";

let cachedToken: { value: string; expiresAt: number } | null = null;

async function getBaiduToken() {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.value;
  }

  const apiKey = process.env.BAIDU_OCR_API_KEY;
  const secretKey = process.env.BAIDU_OCR_SECRET_KEY;
  if (!apiKey || !secretKey) {
    throw new Error("百度 OCR 凭据未配置");
  }

  const url = `https://aip.baidubce.com/oauth/2.0/token?grant_type=client_credentials&client_id=${encodeURIComponent(apiKey)}&client_secret=${encodeURIComponent(secretKey)}`;
  const response = await fetch(url, { method: "POST" });
  const data = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) {
    throw new Error("百度 OCR 获取 token 失败");
  }

  cachedToken = {
    value: data.access_token,
    expiresAt: Date.now() + Number(data.expires_in ?? 2_592_000) * 1000,
  };
  return data.access_token;
}

function parseLinesToQuestions(lines: string[]) {
  let currentNumber = 1;
  return lines
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^(\d+)[\.、\)]\s*(.*)$/);
      if (match) {
        currentNumber = Number(match[1]);
        return {
          questionNumber: currentNumber,
          studentAnswer: match[2] || "",
          confidence: 0.72,
        };
      }
      const item = {
        questionNumber: currentNumber,
        studentAnswer: line,
        confidence: 0.66,
      };
      currentNumber += 1;
      return item;
    });
}

export const baiduOcrEngine: OcrEngine = {
  async recognize(input: OcrEngineInput): Promise<OcrOutput> {
    const token = await getBaiduToken();
    const pages: OcrOutput["pages"] = [];

    for (let i = 0; i < input.buffers.length; i += 1) {
      const base64Image = input.buffers[i].toString("base64");
      const response = await fetch(
        `https://aip.baidubce.com/rest/2.0/ocr/v1/accurate_basic?access_token=${token}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({ image: base64Image }).toString(),
        },
      );

      const data = (await response.json()) as {
        words_result?: Array<{ words?: string }>;
        error_msg?: string;
      };

      if (!response.ok || data.error_msg) {
        throw new Error(data.error_msg || "百度 OCR 识别失败");
      }

      const lines = (data.words_result ?? []).map((item) => item.words ?? "");
      pages.push({
        pageNumber: i + 1,
        questions: parseLinesToQuestions(lines),
      });
    }

    return { pages };
  },
};
