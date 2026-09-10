import { expect, test, type Request } from "@playwright/test";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

type NetworkEntry = {
  sample: string;
  method: string;
  url: string;
  status: number;
  durationMs: number;
  resourceType: string;
};

type ConsoleErrorEntry = {
  sample: string;
  text: string;
  location?: string;
};

type PageErrorEntry = {
  sample: string;
  message: string;
};

type Static404Entry = {
  sample: string;
  url: string;
  resourceType: string;
  status: number;
};

type CrossValidationEntry = {
  sample: string;
  apiField: string;
  domText: string;
  expected: string;
  pass: boolean;
};

type VerificationSample = {
  name: string;
  filePath: string;
  visualTarget: "image" | "table";
  expectFormula?: boolean;
};

type ScanQuestion = {
  questionNumber?: number;
  content?: string;
  options?: Record<string, string | undefined> | null;
};

type ProcessScanResponse = {
  stats?: { total?: number };
  questions?: ScanQuestion[];
};

const KEY_API_PATHS = ["/api/pdf/upload-scan", "/api/pdf/scan-status/", "/api/pdf/process-scan"];
const KEY_GENERATION_PATHS = ["/api/pdf/upload-scan", "/api/pdf/process-scan"];

const SCAN_SAMPLE_CASES: VerificationSample[] = [
  {
    name: "nso-image",
    filePath: "/Users/martin/Documents/竞赛题目/nso_sample_paper_class-1_2025-26.pdf",
    visualTarget: "image",
  },
  {
    name: "usnco-table",
    filePath: "/Users/martin/Documents/竞赛题目/2025-usnco-local-exam.pdf",
    visualTarget: "table",
    expectFormula: true,
  },
  {
    name: "pb-image",
    filePath: "/Users/martin/Documents/竞赛题目/PB-Exam-25-2.pdf",
    visualTarget: "image",
  },
];

function createTimestamp() {
  const now = new Date();
  const yyyy = `${now.getFullYear()}`;
  const mm = `${now.getMonth() + 1}`.padStart(2, "0");
  const dd = `${now.getDate()}`.padStart(2, "0");
  const hh = `${now.getHours()}`.padStart(2, "0");
  const min = `${now.getMinutes()}`.padStart(2, "0");
  const ss = `${now.getSeconds()}`.padStart(2, "0");
  return `${yyyy}${mm}${dd}_${hh}${min}${ss}`;
}

function sanitizeUrl(raw: string) {
  try {
    const url = new URL(raw);
    return `${url.origin}${url.pathname}`;
  } catch {
    return raw.split("?")[0] ?? raw;
  }
}

function normalizeText(raw: string) {
  return raw.replace(/\s+/g, " ").trim();
}

function textSnippet(raw: string, maxLength = 24) {
  if (raw.length <= maxLength) return raw;
  return raw.slice(0, maxLength);
}

function isStaticResource(resourceType: string) {
  return resourceType === "stylesheet" || resourceType === "script" || resourceType === "font";
}

function isKeyApi(url: string) {
  return KEY_API_PATHS.some((pathName) => url.includes(pathName));
}

function isKeyGenerationApi(method: string, url: string) {
  return method === "POST" && KEY_GENERATION_PATHS.some((pathName) => url.includes(pathName));
}

test.describe("Agent Upload UX Verification L1", () => {
  test("应通过 Agent 页面多样本上传解析验收并产出证据", async ({ page }) => {
    test.setTimeout(600000);

    const samples = SCAN_SAMPLE_CASES.filter((sample) => existsSync(sample.filePath));
    test.skip(samples.length === 0, "缺少可用的竞赛 PDF 本地样例，跳过上传验收。");

    const timestamp = createTimestamp();
    const outputDir = path.join(process.cwd(), "document", "ux-verification", timestamp);
    await mkdir(outputDir, { recursive: true });

    const networkEntries: NetworkEntry[] = [];
    const consoleErrors: ConsoleErrorEntry[] = [];
    const pageErrors: PageErrorEntry[] = [];
    const static404: Static404Entry[] = [];
    const crossValidation: CrossValidationEntry[] = [];
    const requestStart = new Map<Request, number>();
    const uploadStatusBySample = new Map<string, number>();
    const processResponseBySample = new Map<string, ProcessScanResponse>();
    let activeSample = "boot";

    page.on("request", (request) => {
      requestStart.set(request, Date.now());
    });

    page.on("response", async (response) => {
      const request = response.request();
      const start = requestStart.get(request) ?? Date.now();
      const durationMs = Math.max(0, Date.now() - start);
      const url = sanitizeUrl(request.url());
      const method = request.method();
      const status = response.status();
      const resourceType = request.resourceType();
      const sampleName = activeSample;

      if (url.includes("/api/")) {
        networkEntries.push({
          sample: sampleName,
          method,
          url,
          status,
          durationMs,
          resourceType,
        });
      }

      if (method === "POST" && url.includes("/api/pdf/upload-scan")) {
        uploadStatusBySample.set(sampleName, status);
      }

      if (method === "POST" && url.includes("/api/pdf/process-scan")) {
        const payload = (await response.json().catch(() => ({}))) as ProcessScanResponse;
        processResponseBySample.set(sampleName, payload);
      }

      if (status === 404 && isStaticResource(resourceType)) {
        static404.push({ sample: sampleName, url, resourceType, status });
      }
    });

    page.on("console", (message) => {
      if (message.type() !== "error") return;
      const location = message.location();
      consoleErrors.push({
        sample: activeSample,
        text: message.text(),
        location:
          location.url && location.lineNumber != null
            ? `${sanitizeUrl(location.url)}:${location.lineNumber}`
            : undefined,
      });
    });

    page.on("pageerror", (error) => {
      pageErrors.push({ sample: activeSample, message: String(error) });
    });

    await page.request.post("/api/pdf/upload-scan").catch(() => null);
    await page.request
      .post("/api/pdf/process-scan", {
        data: { uploadId: "00000000-0000-0000-0000-000000000000" },
      })
      .catch(() => null);

    for (const [index, sample] of samples.entries()) {
      activeSample = sample.name;

      await page.goto("/main/agent", { waitUntil: "domcontentloaded" });
      await expect(page.getByRole("heading", { name: "老师自主 Agent" })).toBeVisible({ timeout: 15000 });

      const loadedShot = index === 0 ? "verify-1-loaded.png" : `${sample.name}-loaded.png`;
      await page.screenshot({
        path: path.join(outputDir, loadedShot),
        fullPage: true,
      });

      await page.locator('input[type="file"]').first().setInputFiles(sample.filePath);
      const textarea = page.locator("textarea").first();
      await textarea.fill("拆解题目");

      const sendButton = page.getByRole("button", { name: "发送" });
      await expect(sendButton).toBeVisible({ timeout: 15000 });
      await expect(sendButton).toBeEnabled({ timeout: 15000 });
      await sendButton.click();

      const actionShot = index === 0 ? "verify-2-after-action.png" : `${sample.name}-after-action.png`;
      await page.screenshot({
        path: path.join(outputDir, actionShot),
        fullPage: true,
      });

      const structuredResult = page.locator('[data-testid="scan-structured-result"]').last();
      await expect(structuredResult).toBeVisible({ timeout: 240000 });
      await expect(page.locator('[data-testid^="scan-question-"]').first()).toBeVisible({ timeout: 240000 });
      await expect.poll(() => uploadStatusBySample.get(sample.name) ?? 0, { timeout: 30000 }).toBeGreaterThanOrEqual(200);
      await expect.poll(() => processResponseBySample.has(sample.name), { timeout: 30000 }).toBeTruthy();

      const uploadStatus = uploadStatusBySample.get(sample.name) ?? 0;
      expect(uploadStatus).toBeLessThan(300);

      const processJson = processResponseBySample.get(sample.name) ?? {};
      const recognizedCount = Number(processJson.stats?.total ?? 0);
      expect(recognizedCount).toBeGreaterThan(0);

      const expectedSummaryPrefix = `文档解析完成：共 1 个文件，识别 ${recognizedCount} 道题`;
      await expect(page.getByText(new RegExp(expectedSummaryPrefix))).toBeVisible({ timeout: 30000 });

      const structuredTextRaw = (await structuredResult.textContent()) ?? "";
      const structuredText = normalizeText(structuredTextRaw);

      crossValidation.push({
        sample: sample.name,
        apiField: "process-scan.stats.total",
        domText: "结构化结果摘要",
        expected: `${expectedSummaryPrefix}...`,
        pass: structuredText.includes(`识别 ${recognizedCount} 道题`),
      });

      const firstQuestion =
        (processJson.questions ?? []).find((item) => normalizeText(String(item.content ?? "")).length > 0) ??
        (processJson.questions ?? [])[0];

      if (firstQuestion) {
        if (firstQuestion.questionNumber != null) {
          crossValidation.push({
            sample: sample.name,
            apiField: "process-scan.questions[0].questionNumber",
            domText: "结构化题号标题",
            expected: `页面包含“第 ${firstQuestion.questionNumber} 题”`,
            pass: structuredText.includes(`第 ${firstQuestion.questionNumber} 题`),
          });
        }

        const stem = normalizeText(String(firstQuestion.content ?? ""));
        if (stem) {
          const stemSnippet = textSnippet(stem, 28);
          crossValidation.push({
            sample: sample.name,
            apiField: "process-scan.questions[0].content",
            domText: "结构化题干渲染",
            expected: `页面包含题干片段“${stemSnippet}”`,
            pass: structuredText.includes(stemSnippet),
          });
        }

        const firstOptionEntry = firstQuestion.options
          ? Object.entries(firstQuestion.options).find(([, value]) => normalizeText(String(value ?? "")).length > 0)
          : undefined;
        if (firstOptionEntry) {
          const [optionKey, optionValue] = firstOptionEntry;
          const optionSnippet = textSnippet(normalizeText(String(optionValue ?? "")), 22);
          crossValidation.push({
            sample: sample.name,
            apiField: `process-scan.questions[0].options.${optionKey}`,
            domText: "结构化选项渲染",
            expected: `页面包含“${optionKey}”及其文本片段“${optionSnippet}”`,
            pass: structuredText.includes(optionKey) && structuredText.includes(optionSnippet),
          });
        }
      }

      if (sample.visualTarget === "image") {
        const image = structuredResult.locator('[data-testid="scan-rich-image"]').first();
        await expect(image).toBeVisible({ timeout: 240000 });
        crossValidation.push({
          sample: sample.name,
          apiField: "process-scan.questions[].linkedFigures",
          domText: "图片渲染",
          expected: "页面存在可见图片",
          pass: (await structuredResult.locator('[data-testid="scan-rich-image"]').count()) > 0,
        });
      }

      if (sample.visualTarget === "table") {
        const table = structuredResult.locator('[data-testid="scan-rich-table"]').first();
        await expect(table).toBeVisible({ timeout: 240000 });
        crossValidation.push({
          sample: sample.name,
          apiField: "process-scan.questions[].content(tabular)",
          domText: "表格渲染",
          expected: "页面存在可见表格",
          pass: (await structuredResult.locator('[data-testid="scan-rich-table"]').count()) > 0,
        });
      }

      if (sample.expectFormula) {
        const katexNode = structuredResult.locator(".katex").first();
        await expect(katexNode).toBeVisible({ timeout: 240000 });
        crossValidation.push({
          sample: sample.name,
          apiField: "process-scan.questions[].content(math)",
          domText: "公式渲染",
          expected: "页面存在 KaTeX 渲染结果",
          pass: (await structuredResult.locator(".katex").count()) > 0,
        });
      }

      const resultShot = index === 0 ? "verify-3-result.png" : `${sample.name}-result.png`;
      await page.screenshot({
        path: path.join(outputDir, resultShot),
        fullPage: true,
      });
    }

    const keyApiEntries = networkEntries.filter((entry) => isKeyApi(entry.url));
    const keyGenerationEntries = networkEntries.filter((entry) => isKeyGenerationApi(entry.method, entry.url));
    const agentChatEntries = networkEntries.filter((entry) => entry.url.includes("/api/agent/chat"));
    const noAgentChatForDirectSplit = agentChatEntries.length === 0;

    crossValidation.push({
      sample: "all",
      apiField: "network",
      domText: "分题直出策略",
      expected: "“拆解题目”场景不触发 /api/agent/chat",
      pass: noAgentChatForDirectSplit,
    });

    const static404Count = static404.length;
    const consoleErrorCount = consoleErrors.length;
    const pageErrorCount = pageErrors.length;
    const keyApiSuccess =
      keyApiEntries.length > 0 &&
      keyApiEntries.every((entry) => entry.status >= 200 && entry.status < 300);
    const generationDurationPass =
      keyGenerationEntries.length > 0 &&
      keyGenerationEntries.every((entry) => entry.durationMs <= 30000);
    const dataFlowPassCount = crossValidation.filter((item) => item.pass).length;
    const dataFlowAllPass = crossValidation.length >= 1 && dataFlowPassCount === crossValidation.length;

    const pass =
      static404Count === 0 &&
      consoleErrorCount === 0 &&
      pageErrorCount === 0 &&
      keyApiSuccess &&
      generationDurationPass &&
      dataFlowAllPass &&
      noAgentChatForDirectSplit;

    await writeFile(
      path.join(outputDir, "network.json"),
      JSON.stringify(
        {
          keyRequests: keyApiEntries,
          allApiRequests: networkEntries,
        },
        null,
        2,
      ),
      "utf8",
    );

    await writeFile(
      path.join(outputDir, "errors.json"),
      JSON.stringify(
        {
          static404,
          consoleErrors,
          pageErrors,
          counts: {
            static404: static404Count,
            consoleErrors: consoleErrorCount,
            pageErrors: pageErrorCount,
          },
        },
        null,
        2,
      ),
      "utf8",
    );

    const durationLines =
      keyGenerationEntries.length > 0
        ? keyGenerationEntries
            .map(
              (entry) =>
                `  - [${entry.sample}] ${entry.method} ${entry.url}: ${(entry.durationMs / 1000).toFixed(2)}s`,
            )
            .join("\n")
        : "  - 无关键生成接口记录";

    const crossValidationLines = crossValidation
      .map(
        (item) =>
          `  - [${item.sample}] API 字段 \`${item.apiField}\` -> DOM 文本 \`${item.domText}\`（期望：${item.expected}）: ${item.pass ? "PASS" : "FAIL"}`,
      )
      .join("\n");

    const extraScreenshots = samples
      .slice(1)
      .flatMap((sample) => [
        `${sample.name}-loaded.png`,
        `${sample.name}-after-action.png`,
        `${sample.name}-result.png`,
      ]);

    const report = `## UX 验证报告

- 验证级别: L1
- 最终结论: ${pass ? "PASS" : "FAIL"}
- 样本:
  - ${samples.map((sample) => sample.name).join(" / ")}
- 关键接口耗时:
${durationLines}
- 错误统计:
  - 静态资源 404: ${static404Count}
  - console error: ${consoleErrorCount}
  - pageerror: ${pageErrorCount}
- 数据流交叉验证:
${crossValidationLines}
- 截图:
  - verify-1-loaded.png
  - verify-2-after-action.png
  - verify-3-result.png
${extraScreenshots.map((fileName) => `  - ${fileName}`).join("\n")}
- 产物目录:
  - document/ux-verification/${timestamp}/
`;

    await writeFile(path.join(outputDir, "report.md"), report, "utf8");

    expect(pass, `UX 验证未通过，详情见 ${path.join(outputDir, "report.md")}`).toBe(true);
  });
});
